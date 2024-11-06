import { Blockchain, SandboxContract, TreasuryContract, prettyLogTransactions } from '@ton/sandbox';
import { Address, Dictionary, fromNano, toNano } from '@ton/core';
import { HypersonicMainContract, MonthlyDistribution, Payout } from '../wrappers/HypersonicMainContract';
import '@ton/test-utils';
import { HypersonicUserContract } from '../build/HypersonicMainContract/tact_HypersonicUserContract';
import {
    MatrixMemberPositionData,
    Position,
    MatrixPosition,
    MatrixMemberData,
    SubscriptionType,
    MatrixMonthlyDistributionData,
    SubscriptionPrices,
    UnilevelMemberData,
    UnilevelPackageDistributionData,
    PackageLevelPrices,
    PackageLevelPayoutPercentages,
} from '../data/data-structures';

const contractKey = 'testKey';

const countChildren = (member: MatrixMemberPositionData) => {
    if (member.children?.length < 1) return 0;
    let count = member.children.length;
    member.children.forEach((child: any) => {
        count += countChildren(child);
    });
    return count;
};

const determinePositionInMatrix = async (
    parentMember: MatrixMemberPositionData,
    blockchain: Blockchain,
): Promise<Position> => {
    if (parentMember.leftChild == null) {
        return {
            parent: parentMember.address,
            position: MatrixPosition.Left,
        };
    } else if (parentMember.middleChild == null) {
        return {
            parent: parentMember.address,
            position: MatrixPosition.Middle,
        };
    } else if (parentMember.rightChild == null) {
        return {
            parent: parentMember.address,
            position: MatrixPosition.Right,
        };
    } else {
        const leftChildMatrixMember = await convertAddressToMatrixMemberPositionData(
            parentMember.leftChild.address,
            blockchain,
        );
        const middleChildMatrixMember = await convertAddressToMatrixMemberPositionData(
            parentMember.middleChild.address,
            blockchain,
        );
        const rightChildMatrixMember = await convertAddressToMatrixMemberPositionData(
            parentMember.rightChild.address,
            blockchain,
        );

        const leftChildCount = countChildren(leftChildMatrixMember);
        const middleChildCount = countChildren(middleChildMatrixMember);
        const rightChildCount = countChildren(rightChildMatrixMember);

        if (leftChildCount <= middleChildCount && leftChildCount <= rightChildCount) {
            return await determinePositionInMatrix(parentMember.leftChild, blockchain);
        } else if (middleChildCount < leftChildCount && middleChildCount <= rightChildCount) {
            return await determinePositionInMatrix(parentMember.middleChild, blockchain);
        } else {
            return await determinePositionInMatrix(parentMember.rightChild, blockchain);
        }
    }
};

const convertAddressToMatrixMemberPositionData = async (
    address: Address,
    blockchain: Blockchain,
): Promise<MatrixMemberPositionData> => {
    const userContract = blockchain.openContract(await HypersonicUserContract.fromInit(address));

    const userMatrixData = await userContract.getMatrixUserData();

    const leftChild = userMatrixData.leftChildUser
        ? await convertAddressToMatrixMemberPositionData(userMatrixData.leftChildUser, blockchain)
        : null;
    const middleChild = userMatrixData.middleChildUser
        ? await convertAddressToMatrixMemberPositionData(userMatrixData.middleChildUser, blockchain)
        : null;
    const rightChild = userMatrixData.rightChildUser
        ? await convertAddressToMatrixMemberPositionData(userMatrixData.rightChildUser, blockchain)
        : null;

    return {
        address: address,
        leftChild: leftChild,
        middleChild: middleChild,
        rightChild: rightChild,
        children: [leftChild, middleChild, rightChild].filter((child) => child != null) as MatrixMemberPositionData[],
    };
};

const convertAddressToMatrixMemberData = async (
    address: Address,
    blockchain: Blockchain,
): Promise<MatrixMemberData> => {
    const userContract = blockchain.openContract(await HypersonicUserContract.fromInit(address));

    const userMatrixData = await userContract.getMatrixUserData();
    const userUnilevelData = await userContract.getUniLevelUserData();

    const leftChild = userMatrixData.leftChildUser
        ? await convertAddressToMatrixMemberPositionData(userMatrixData.leftChildUser, blockchain)
        : null;
    const middleChild = userMatrixData.middleChildUser
        ? await convertAddressToMatrixMemberPositionData(userMatrixData.middleChildUser, blockchain)
        : null;
    const rightChild = userMatrixData.rightChildUser
        ? await convertAddressToMatrixMemberPositionData(userMatrixData.rightChildUser, blockchain)
        : null;

    return {
        username: userMatrixData.username,
        packageLevel: Number(userUnilevelData.packageLevel),
        walletAddress: address,
        matrixRegistrationDate: userMatrixData.matrixRegistrationDate
            ? new Date(Number(userMatrixData.matrixRegistrationDate) * 1000)
            : null,
        matrixExpirationDate: userMatrixData.matrixExpirationDate
            ? new Date(Number(userMatrixData.matrixExpirationDate) * 1000)
            : null,
        matrixSubscriptionType: userMatrixData.matrixSubscriptionType as SubscriptionType,
        matrixSubscriptionActive: userMatrixData.matrixStatuses?.matrixSubscriptionActive ?? false,
        parentUser: userMatrixData.parentUser,
        leftChildUser: userMatrixData.leftChildUser,
        middleChildUser: userMatrixData.middleChildUser,
        rightChildUser: userMatrixData.rightChildUser,
        matrixSubscriptionGracePeriodActive:
            userMatrixData.matrixStatuses?.matrixSubscriptionGracePeriodActive ?? false,
    };
};

const getUserMatrixData = async (
    baseMember: MatrixMemberData,
    blockchain: Blockchain,
    level: number = 0,
): Promise<MatrixMemberData[]> => {
    let members: MatrixMemberData[] = [baseMember];

    if (level < 10) {
        if (baseMember.leftChildUser) {
            const leftChildMatrixData = await convertAddressToMatrixMemberData(baseMember.leftChildUser, blockchain);
            members = members.concat(await getUserMatrixData(leftChildMatrixData, blockchain, level + 1));
        }

        if (baseMember.middleChildUser) {
            const middleChildMatrixData = await convertAddressToMatrixMemberData(
                baseMember.middleChildUser,
                blockchain,
            );
            members = members.concat(await getUserMatrixData(middleChildMatrixData, blockchain, level + 1));
        }

        if (baseMember.rightChildUser) {
            const rightChildMatrixData = await convertAddressToMatrixMemberData(baseMember.rightChildUser, blockchain);
            members = members.concat(await getUserMatrixData(rightChildMatrixData, blockchain, level + 1));
        }
    }

    return members;
};

const getUserDirectSponsorsMatrices = async (
    baseMember: MatrixMemberData,
    blockchain: Blockchain,
): Promise<MatrixMemberData[][]> => {
    const baseMemberContract = blockchain.openContract(await HypersonicUserContract.fromInit(baseMember.walletAddress));

    const baseMemberDirectSponsors = (await baseMemberContract.getInvited()).mapping.values();

    let directSponsorsMatricesData: MatrixMemberData[][] = [];

    for (const directSponsor of baseMemberDirectSponsors) {
        const directSponsorData = await convertAddressToMatrixMemberData(directSponsor, blockchain);
        const directSponsorMatrixData = await getUserMatrixData(directSponsorData, blockchain);

        directSponsorsMatricesData.push(
            directSponsorMatrixData.filter((member) => member.walletAddress !== directSponsorData.walletAddress),
        );
    }

    return directSponsorsMatricesData.filter((matrix) => matrix.length > 0);
};

const getUser2ndGenSponsorsMatrices = async (
    baseMember: MatrixMemberData,
    blockchain: Blockchain,
): Promise<MatrixMemberData[][]> => {
    const baseMemberContract = blockchain.openContract(await HypersonicUserContract.fromInit(baseMember.walletAddress));

    const baseMemberDirectSponsors = (await baseMemberContract.getInvited()).mapping.values();

    let secondGenSponsorsMatricesData: MatrixMemberData[][] = [];

    for (const directSponsor of baseMemberDirectSponsors) {
        const directSponsorData = await convertAddressToMatrixMemberData(directSponsor, blockchain);
        const directSponsorDirectSponsors = (
            await blockchain
                .openContract(await HypersonicUserContract.fromInit(directSponsorData.walletAddress))
                .getInvited()
        ).mapping.values();

        for (const secondGenSponsor of directSponsorDirectSponsors) {
            const secondGenSponsorData = await convertAddressToMatrixMemberData(secondGenSponsor, blockchain);
            const secondGenSponsorMatrixData = await getUserMatrixData(secondGenSponsorData, blockchain);

            secondGenSponsorsMatricesData.push(
                secondGenSponsorMatrixData.filter(
                    (member) => member.walletAddress !== secondGenSponsorData.walletAddress,
                ),
            );
        }
    }

    return secondGenSponsorsMatricesData.filter((matrix) => matrix.length > 0);
};

const calculateMatrixDistributionData = (
    targetMember: MatrixMemberData,
    memberMatrixData: MatrixMemberData[],
    directSponsorsMatricesData: MatrixMemberData[][],
    secondGenSponsorsMatricesData: MatrixMemberData[][],
): MatrixMonthlyDistributionData => {
    const determineSubscriptionFee = (targetMemberData: MatrixMemberData, determineMonthlyForYearlyPlans = false) => {
        switch (targetMemberData.matrixSubscriptionType) {
            case SubscriptionType.MonthlyAfter30Days:
                return SubscriptionPrices.MonthlyAfter30Days;
            case SubscriptionType.MonthlyWithin30Days:
                return SubscriptionPrices.MonthlyWithin30Days;
            case SubscriptionType.YearlyAfter30Days:
                if (determineMonthlyForYearlyPlans === false) {
                    return 0;
                }
                return SubscriptionPrices.YearlyAfter30Days / 12; // Divide by 12 months
            case SubscriptionType.YearlyWithin30Days:
                if (determineMonthlyForYearlyPlans === false) {
                    return 0;
                }
                return SubscriptionPrices.YearlyWithin30Days / 12; // Divide by 12 months
        }
    };

    const calculatePercentageOfRevenue = (revenue: number, percentage: number) => {
        return (revenue * percentage) / 100;
    };

    const filteredMemberMatrixData = memberMatrixData.filter(
        (memberData: MatrixMemberData) =>
            memberData.walletAddress !== targetMember.walletAddress &&
            memberData.matrixSubscriptionActive === true &&
            memberData.matrixExpirationDate &&
            memberData.matrixExpirationDate > new Date(),
    );

    let totalMemberRevenue = 0;
    let totalCompanyRevenue = 0;
    const subscriptionFee = determineSubscriptionFee(targetMember);

    for (const memberInMatrix of filteredMemberMatrixData) {
        let collectedRevenue = calculatePercentageOfRevenue(determineSubscriptionFee(memberInMatrix, true), 5);

        totalMemberRevenue += collectedRevenue;
    }

    if (targetMember.packageLevel > 4) {
        directSponsorsMatricesData.forEach((matrix) => {
            matrix
                .filter(
                    (member) =>
                        member.matrixSubscriptionActive &&
                        member.matrixExpirationDate &&
                        member.matrixExpirationDate > new Date(),
                )
                .forEach((member) => {
                    totalMemberRevenue += calculatePercentageOfRevenue(determineSubscriptionFee(member, true), 2);
                });
        });
    } else {
        totalCompanyRevenue += calculatePercentageOfRevenue(determineSubscriptionFee(targetMember, true), 20);
    }

    if (targetMember.packageLevel > 6) {
        secondGenSponsorsMatricesData.forEach((matrix) => {
            matrix
                .filter(
                    (member) =>
                        member.matrixSubscriptionActive &&
                        member.matrixExpirationDate &&
                        member.matrixExpirationDate > new Date(),
                )
                .forEach((member) => {
                    totalMemberRevenue += calculatePercentageOfRevenue(determineSubscriptionFee(member, true), 2);
                });
        });
    } else {
        totalCompanyRevenue += calculatePercentageOfRevenue(determineSubscriptionFee(targetMember, true), 20);
    }

    totalCompanyRevenue += calculatePercentageOfRevenue(determineSubscriptionFee(targetMember, true), 10);
    totalCompanyRevenue +=
        calculatePercentageOfRevenue(determineSubscriptionFee(targetMember, true), 50) - totalMemberRevenue;

    return {
        username: targetMember.username,
        walletAddress: targetMember.walletAddress,
        memberRevenue: totalMemberRevenue,
        companyRevenue: totalCompanyRevenue,
        subscriptionFee,
    };
};

const calculateUnilevelDistributionData = (
    targetMember: UnilevelMemberData,
    levelsToUpgrade: number,
): UnilevelPackageDistributionData => {
    const currentPackageLevel = targetMember.packageLevel;
    const newPackageLevel = currentPackageLevel + levelsToUpgrade;
    let totalUpgradeCost = 0;
    let totalCompanyPayout = 0;

    let payouts: any = {};

    for (let level = currentPackageLevel + 1; level <= newPackageLevel; level++) {
        const levelPrice = PackageLevelPrices[`Level${level}` as keyof typeof PackageLevelPrices];
        totalUpgradeCost += levelPrice;
        totalCompanyPayout += (levelPrice * 10) / 100; // 10% to company by default

        for (let i: number = 1; i <= 7; i++) {
            const payoutPercentage =
                PackageLevelPayoutPercentages[`Level${i}` as keyof typeof PackageLevelPayoutPercentages];
            if (payoutPercentage) {
                const payoutAmount = (levelPrice * payoutPercentage) / 100;
                let currentAddress = null;

                if (targetMember.uplinesPackageLevels[i - 1] && targetMember.uplinesPackageLevels[i - 1] >= level) {
                    currentAddress = targetMember.uplineAddresses[i - 1];
                } else {
                    totalCompanyPayout += payoutAmount;
                    continue;
                }

                if (payouts[i]) {
                    payouts[i].amount = toNano(fromNano(payouts[i].amount) + payoutAmount);
                } else {
                    payouts[i] = {
                        amount: toNano(payoutAmount),
                        recipient: currentAddress,
                    };
                }
            }
        }
    }

    payouts[8] = {
        amount: toNano(totalCompanyPayout),
        recipient: null,
    };

    const payoutDictionary: Dictionary<bigint, Payout> = Dictionary.empty();
    for (let i = 1; i <= 8; i++) {
        const payoutData = payouts[i as keyof typeof payouts];
        if (payoutData) {
            payoutDictionary.set(BigInt(i), payoutData);
        }
    }

    return {
        username: targetMember.username,
        walletAddress: targetMember.walletAddress,
        targetPackageLevel: newPackageLevel,
        targetPackageLevelPrice: totalUpgradeCost,
        payouts: payoutDictionary,
    };
};

const upgradeUserUnilevel = async (
    userWallet: SandboxContract<TreasuryContract>,
    userData: any,
    uplinesPackageLevelsMapping: Dictionary<bigint, bigint>,
    levelsToUpgrade: number,
    contractKey: string,
    hypersonicMainContract: SandboxContract<HypersonicMainContract>,
) => {
    const userUpgradePlanData = calculateUnilevelDistributionData(
        {
            username: userData.username,
            walletAddress: userData.walletAddress,
            uplinesPackageLevels: uplinesPackageLevelsMapping.values().map((value) => Number(value)),
            uplineAddresses: userData.upline.mapping.values(),
            packageLevel: Number(userData.packageLevel),
        },
        levelsToUpgrade,
    );

    const userUpgradeResult = await hypersonicMainContract.send(
        userWallet.getSender(),
        {
            value: toNano('0.25'),
        },
        {
            $$type: 'UpgradePlan',
            walletAddress: userWallet.getSender().address,
            targetPackageLevel: BigInt(userUpgradePlanData.targetPackageLevel),
            targetPackageLevelPrice: toNano(userUpgradePlanData.targetPackageLevelPrice),
            payouts: userUpgradePlanData.payouts,
            contractKey: contractKey,
        },
    );

    return userUpgradeResult;
};

describe('HypersonicMainContract', () => {
    let blockchain: Blockchain;

    let deployer: SandboxContract<TreasuryContract>;
    let newOwnerWallet: SandboxContract<TreasuryContract>;
    let companyWallet: SandboxContract<TreasuryContract>;
    let user1Wallet: SandboxContract<TreasuryContract>;
    let user2Wallet: SandboxContract<TreasuryContract>;
    let user3Wallet: SandboxContract<TreasuryContract>;
    let user4Wallet: SandboxContract<TreasuryContract>;
    let user5Wallet: SandboxContract<TreasuryContract>;
    let user6Wallet: SandboxContract<TreasuryContract>;
    let user7Wallet: SandboxContract<TreasuryContract>;
    let user8Wallet: SandboxContract<TreasuryContract>;
    let user9Wallet: SandboxContract<TreasuryContract>;
    let user10Wallet: SandboxContract<TreasuryContract>;
    let user11Wallet: SandboxContract<TreasuryContract>;
    let user12Wallet: SandboxContract<TreasuryContract>;

    let hypersonicMainContract: SandboxContract<HypersonicMainContract>;

    let user1: SandboxContract<HypersonicUserContract>;
    let user2: SandboxContract<HypersonicUserContract>;
    let user3: SandboxContract<HypersonicUserContract>;
    let user4: SandboxContract<HypersonicUserContract>;
    let user5: SandboxContract<HypersonicUserContract>;
    let user6: SandboxContract<HypersonicUserContract>;
    let user7: SandboxContract<HypersonicUserContract>;
    let user8: SandboxContract<HypersonicUserContract>;
    let user9: SandboxContract<HypersonicUserContract>;
    let user10: SandboxContract<HypersonicUserContract>;
    let user11: SandboxContract<HypersonicUserContract>;
    let user12: SandboxContract<HypersonicUserContract>;

    let user1RegistrationData: any;

    beforeEach(async () => {
        blockchain = await Blockchain.create();

        // blockchain.verbosity = {
        //     blockchainLogs: false,
        //     vmLogs: 'vm_logs',
        //     debugLogs: true,
        //     print: true
        // };

        deployer = await blockchain.treasury('deployer');
        companyWallet = await blockchain.treasury('company');
        newOwnerWallet = await blockchain.treasury('newOwnerWallet');
        user1Wallet = await blockchain.treasury('user1');
        user2Wallet = await blockchain.treasury('user2');
        user3Wallet = await blockchain.treasury('user3');
        user4Wallet = await blockchain.treasury('user4');
        user5Wallet = await blockchain.treasury('user5');
        user6Wallet = await blockchain.treasury('user6');
        user7Wallet = await blockchain.treasury('user7');
        user8Wallet = await blockchain.treasury('user8');
        user9Wallet = await blockchain.treasury('user9');
        user10Wallet = await blockchain.treasury('user10');
        user11Wallet = await blockchain.treasury('user11');
        user12Wallet = await blockchain.treasury('user12');

        const uplineMapping: Dictionary<bigint, Address> = Dictionary.empty();
        uplineMapping.set(1n, companyWallet.getSender().address);

        user1RegistrationData = {
            walletAddress: user1Wallet.getSender().address,
            username: 'testUser',
            upline: {
                $$type: 'Upline',
                mapping: uplineMapping,
                count: BigInt(uplineMapping.values().length),
            },
            contractKey: contractKey,
        };

        hypersonicMainContract = blockchain.openContract(
            await HypersonicMainContract.fromInit(companyWallet.getSender().address, contractKey),
        );
        user1 = blockchain.openContract(await HypersonicUserContract.fromInit(user1RegistrationData.walletAddress));

        const deployResult = await hypersonicMainContract.send(
            deployer.getSender(),
            {
                value: toNano('1'),
            },
            {
                $$type: 'Deploy',
                queryId: 0n,
            },
        );

        const startDate = await hypersonicMainContract.getStartDate();

        console.log('Main Contract Launch Date:', new Date(Number(startDate) * 1000).toLocaleString());

        const companyUplineMapping: Dictionary<bigint, Address> = Dictionary.empty();

        const preRegisterData = {
            walletAddress: companyWallet.getSender().address,
            username: 'Hypersonic_2x_DAO',
            upline: {
                $$type: 'Upline' as const,
                mapping: companyUplineMapping,
                count: BigInt(companyUplineMapping.values().length),
            },
            packageLevel: 7n,
            matrixParentUser: null,
            matrixPosition: MatrixPosition.Left,
            subscriptionType: SubscriptionType.MonthlyWithin30Days,
            contractKey: contractKey,
        };

        const forcePlaceCompanyResult = await hypersonicMainContract.send(
            deployer.getSender(),
            {
                value: toNano('0.7'),
            },
            {
                $$type: 'PreRegisterMember',
                ...preRegisterData,
            },
        );

        const companyContract = await blockchain.openContract(
            await HypersonicUserContract.fromInit(companyWallet.getSender().address),
        );

        const companyUnilevelData = await companyContract.getUniLevelUserData();
        const companyMatrixData = await companyContract.getMatrixUserData();

        console.log('Company Unilevel Data:', companyUnilevelData);
        console.log('\nCompany Matrix Data:', companyMatrixData);

        expect(deployResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: hypersonicMainContract.address,
            deploy: true,
            success: true,
        });
    });

    const checkRegistration = async (showLogs = false) => {
        const numberOfUsersBefore = await hypersonicMainContract.getNumberOfUsers();
        expect(numberOfUsersBefore.toString()).toEqual('1');

        const sendTONResult = await hypersonicMainContract.send(
            deployer.getSender(),
            {
                value: toNano('100'),
            },
            'Deposited',
        );

        const senderWalletBalanceBefore = await user1Wallet.getBalance();
        const contractBalanceBefore = await hypersonicMainContract.getBalance();

        const registerResult = await hypersonicMainContract.send(
            user1Wallet.getSender(),
            {
                value: toNano('0.25'),
            },
            {
                $$type: 'Register',
                ...user1RegistrationData,
            },
        );

        const senderWalletBalanceAfter = await user1Wallet.getBalance();
        const contractBalanceAfter = await hypersonicMainContract.getBalance();

        const numberOfUsersAfter = await hypersonicMainContract.getNumberOfUsers();
        expect(numberOfUsersAfter.toString()).toEqual('2');

        const expectedUserAddress = await hypersonicMainContract.getUniLevelUserAddress(
            user1RegistrationData.walletAddress,
        );
        const newUserAddress = await user1.getMyAddress();
        expect(newUserAddress.toString()).toEqual(expectedUserAddress.toString());

        if (showLogs) {
            console.log('-------------------------------------------------');
            console.table([
                {
                    Description: 'User Transaction Fees For Registration',
                    'Amount (TON)': (
                        Number(senderWalletBalanceBefore) / Number(toNano(1)) -
                        Number(senderWalletBalanceAfter) / Number(toNano(1))
                    ).toFixed(5),
                },
                {
                    Description: 'Main Contract Computation Fees For Registration',
                    'Amount (TON)': (
                        Number(contractBalanceBefore) / Number(toNano(1)) -
                        Number(contractBalanceAfter) / Number(toNano(1))
                    ).toFixed(5),
                },
                {
                    Description: 'User Contract Balance After Registration',
                    'Amount (TON)': (Number(await user1.getBalance()) / Number(toNano(1))).toFixed(5),
                },
            ]);
        }

        const userData = await user1.getUniLevelUserData();

        const retrievedUsername = userData.username;
        expect(retrievedUsername).toEqual(user1RegistrationData.username);

        const retrievedUpline = userData.upline;
        expect(retrievedUpline.mapping.get(1n)?.toString()).toEqual(
            user1RegistrationData.upline.mapping.get(1n)?.toString(),
        );
        expect(retrievedUpline.count).toEqual(1n);

        const retrievedInvited = userData.invited;
        expect(retrievedInvited.mapping.values()).toEqual([]);

        const retrievedPackageLevel = userData.packageLevel;
        expect(retrievedPackageLevel).toEqual(0n);

        const retrievedBalance = userData.balance;
        expect(retrievedBalance).toEqual(0n);
    };

    const checkDeposit = async (depositAmount: number, showLogs = false) => {
        const senderWalletBalanceBefore = await user1Wallet.getBalance();
        const contractBalanceBefore = await hypersonicMainContract.getBalance();
        const userBalanceBefore = (await user1.getUniLevelUserData()).balance;
        const userContractBalanceBefore = await user1.getBalance();

        const depositResult = await hypersonicMainContract.send(
            user1Wallet.getSender(),
            {
                value: toNano(depositAmount + 0.25),
            },
            {
                $$type: 'Deposit',
                walletAddress: user1RegistrationData.walletAddress,
                amount: toNano(depositAmount),
                contractKey: contractKey,
            },
        );

        const senderWalletBalanceAfter = await user1Wallet.getBalance();
        const contractBalanceAfter = await hypersonicMainContract.getBalance();
        const userBalanceAfter = (await user1.getUniLevelUserData()).balance;

        expect(Number(fromNano(senderWalletBalanceAfter))).toBeCloseTo(
            Number(fromNano(senderWalletBalanceBefore)) - depositAmount,
            0,
        );

        if (showLogs) {
            console.log('-------------------------------------------------');
            console.table([
                {
                    Description: 'Amount to Deposit',
                    'Amount (TON)': Number(depositAmount).toFixed(5),
                },
                {
                    Description: 'User Transaction Fees For Depositing',
                    'Amount (TON)': (
                        Number(fromNano(senderWalletBalanceBefore)) -
                        Number(fromNano(senderWalletBalanceAfter)) -
                        depositAmount
                    ).toFixed(5),
                },
                {
                    Description: 'Main Contract Computation Fees For Depositing',
                    'Amount (TON)': (
                        Number(contractBalanceBefore) / Number(toNano(1)) -
                        Number(contractBalanceAfter) / Number(toNano(1)) +
                        depositAmount
                    ).toFixed(5),
                },
                {
                    Description: 'Main Contract Balance Before Depositing',
                    'Amount (TON)': (Number(contractBalanceBefore) / Number(toNano(1))).toFixed(5),
                },
                {
                    Description: 'Main Contract Balance After Depositing',
                    'Amount (TON)': (Number(contractBalanceAfter) / Number(toNano(1))).toFixed(5),
                },
                {
                    Description: 'User Contract Balance Before Depositing',
                    'Amount (TON)': (Number(userContractBalanceBefore) / Number(toNano(1))).toFixed(5),
                },
                {
                    Description: 'User Contract Balance After Depositing',
                    'Amount (TON)': (Number(await user1.getBalance()) / Number(toNano(1))).toFixed(5),
                },
                {
                    Description: 'User Balance Before Depositing',
                    'Amount (TON)': Number(fromNano(userBalanceBefore)).toFixed(5),
                },
                {
                    Description: 'User Balance After Depositing',
                    'Amount (TON)': Number(fromNano(userBalanceAfter)).toFixed(5),
                },
            ]);
        }

        const userData = await user1.getUniLevelUserData();
        const retrievedBalance = userData.balance;
        expect(retrievedBalance).toEqual(toNano(depositAmount));

        const mainContractBalance = await hypersonicMainContract.getBalance();
        expect(mainContractBalance).toBeGreaterThanOrEqual(toNano(depositAmount));

        const user1ContractBalance = await user1.getBalance();
        expect(user1ContractBalance).toBeGreaterThan(toNano(0));
    };

    const checkWithdraw = async (startingBalance: number, withdrawAmount: number, showLogs = false) => {
        const senderWalletBalanceBefore = await user1Wallet.getBalance();
        const contractBalanceBefore = await hypersonicMainContract.getBalance();
        const userBalanceBefore = (await user1.getUniLevelUserData()).balance;
        const userContractBalanceBefore = await user1.getBalance();

        const withdrawResult = await hypersonicMainContract.send(
            user1Wallet.getSender(),
            {
                value: toNano(0.25),
            },
            {
                $$type: 'Withdraw',
                walletAddress: user1RegistrationData.walletAddress,
                amount: toNano(withdrawAmount),
                contractKey: contractKey,
            },
        );

        const userData = await user1.getUniLevelUserData();
        const retrievedBalance = userData.balance;
        expect(retrievedBalance).toEqual(toNano(startingBalance) - toNano(withdrawAmount));

        const mainContractBalance = await hypersonicMainContract.getBalance();
        expect(mainContractBalance).toBeGreaterThanOrEqual(toNano(withdrawAmount));

        const user1ContractBalance = await user1.getBalance();
        expect(user1ContractBalance).toBeGreaterThan(toNano(0));

        const senderWalletBalanceAfter = await user1Wallet.getBalance();
        expect(Number(fromNano(senderWalletBalanceAfter))).toBeCloseTo(
            Number(fromNano(senderWalletBalanceBefore)) + withdrawAmount,
            0,
        );

        const userBalanceAfter = (await user1.getUniLevelUserData()).balance;
        const contractBalanceAfter = await hypersonicMainContract.getBalance();

        if (showLogs) {
            console.log('-------------------------------------------------');
            console.table([
                {
                    Description: 'Amount to Withdraw',
                    'Amount (TON)': Number(withdrawAmount).toFixed(5),
                },
                {
                    Description: 'User Transaction Fees For Withdrawing',
                    'Amount (TON)': (
                        Number(Number(senderWalletBalanceBefore) / Number(toNano(1))) +
                        withdrawAmount -
                        Number(senderWalletBalanceAfter) / Number(toNano(1))
                    ).toFixed(5),
                },
                {
                    Description: 'Main Contract Computation Fees For Withdrawing',
                    'Amount (TON)': (
                        Number(contractBalanceBefore) / Number(toNano(1)) -
                        Number(mainContractBalance) / Number(toNano(1)) -
                        withdrawAmount
                    ).toFixed(5),
                },
                {
                    Description: 'Main Contract Balance Before Withdrawing',
                    'Amount (TON)': (Number(contractBalanceBefore) / Number(toNano(1))).toFixed(5),
                },
                {
                    Description: 'Main Contract Balance After Withdrawing',
                    'Amount (TON)': (Number(contractBalanceAfter) / Number(toNano(1))).toFixed(5),
                },
                {
                    Description: 'User Contract Balance Before Withdrawing',
                    'Amount (TON)': (Number(userContractBalanceBefore) / Number(toNano(1))).toFixed(5),
                },
                {
                    Description: 'User Contract Balance After Withdrawing',
                    'Amount (TON)': (Number(await user1.getBalance()) / Number(toNano(1))).toFixed(5),
                },
                {
                    Description: 'User Balance Before Withdrawing',
                    'Amount (TON)': Number(fromNano(userBalanceBefore)).toFixed(5),
                },
                {
                    Description: 'User Balance After Withdrawing',
                    'Amount (TON)': Number(fromNano(userBalanceAfter)).toFixed(5),
                },
            ]);
        }
    };

    const checkUplines = async (showLogs = false) => {
        user2 = blockchain.openContract(await HypersonicUserContract.fromInit(user2Wallet.getSender().address));

        user3 = blockchain.openContract(await HypersonicUserContract.fromInit(user3Wallet.getSender().address));

        user4 = blockchain.openContract(await HypersonicUserContract.fromInit(user4Wallet.getSender().address));

        user5 = blockchain.openContract(await HypersonicUserContract.fromInit(user5Wallet.getSender().address));

        user6 = blockchain.openContract(await HypersonicUserContract.fromInit(user6Wallet.getSender().address));

        user7 = blockchain.openContract(await HypersonicUserContract.fromInit(user7Wallet.getSender().address));

        user8 = blockchain.openContract(await HypersonicUserContract.fromInit(user8Wallet.getSender().address));

        user9Wallet = await blockchain.treasury('user9');
        user9 = blockchain.openContract(await HypersonicUserContract.fromInit(user9Wallet.getSender().address));

        user10Wallet = await blockchain.treasury('user10');
        user10 = blockchain.openContract(await HypersonicUserContract.fromInit(user10Wallet.getSender().address));

        user11Wallet = await blockchain.treasury('user11');
        user11 = blockchain.openContract(await HypersonicUserContract.fromInit(user11Wallet.getSender().address));

        user12Wallet = await blockchain.treasury('user12');
        user12 = blockchain.openContract(await HypersonicUserContract.fromInit(user12Wallet.getSender().address));

        const user1Data = await user1.getUniLevelUserData();
        const user1Upline = user1Data.upline.mapping;

        const user2UplineMapping: Dictionary<bigint, Address> = Dictionary.empty();
        user2UplineMapping.set(1n, user1Wallet.getSender().address);
        user1Upline
            .keys()
            .slice(0, 6)
            .forEach((key, index) => {
                user2UplineMapping.set(BigInt(index + 2), user1Upline.get(key)!);
            });

        const user2RegistrationData = {
            walletAddress: user2Wallet.getSender().address,
            username: 'testUser2',
            upline: {
                $$type: 'Upline' as 'Upline',
                mapping: user2UplineMapping,
                count: BigInt(user2UplineMapping.values().length),
            },
            contractKey: contractKey,
        };

        const user2WalletBalanceBefore = await user2Wallet.getBalance();
        const mainContractBalanceBeforeUser2Registration = await hypersonicMainContract.getBalance();

        const user2RegisterResult = await hypersonicMainContract.send(
            user2Wallet.getSender(),
            {
                value: toNano('0.25'),
            },
            {
                $$type: 'Register',
                ...user2RegistrationData,
            },
        );

        const user2WalletBalanceAfter = await user2Wallet.getBalance();
        const mainContractBalanceAfterUser2Registration = await hypersonicMainContract.getBalance();

        if (showLogs) {
            console.log('-------------------------------------------------');
            console.table([
                {
                    Description: 'User 2 Transaction Fees For Registration',
                    'Amount (TON)': (
                        Number(user2WalletBalanceBefore) / Number(toNano(1)) -
                        Number(user2WalletBalanceAfter) / Number(toNano(1))
                    ).toFixed(5),
                },
                {
                    Description: 'Main Contract Transaction Fees After User 2 Registration',
                    'Amount (TON)': (
                        Number(mainContractBalanceBeforeUser2Registration) / Number(toNano(1)) -
                        Number(mainContractBalanceAfterUser2Registration) / Number(toNano(1))
                    ).toFixed(5),
                },
            ]);
        }

        const updatedUser1Data = await user1.getUniLevelUserData();
        expect(updatedUser1Data.invited.mapping.values()[0].toString()).toEqual(
            user2Wallet.getSender().address.toString(),
        );
        expect(updatedUser1Data.invited.count).toEqual(1n);

        const user2Data = await user2.getUniLevelUserData();
        const user2Upline = user2Data.upline.mapping;

        expect(user2Data.username).toEqual(user2RegistrationData.username);
        expect(user2Data.walletAddress.toString()).toEqual(user2Wallet.getSender().address.toString());
        expect(Number(user2Data.upline.count)).toEqual(user2UplineMapping.values().length);

        const numberOfUsersAfterUser2Registration = await hypersonicMainContract.getNumberOfUsers();
        expect(numberOfUsersAfterUser2Registration.toString()).toEqual('3');

        expect(user2Upline.get(1n)?.toString()).toEqual(user1Wallet.getSender().address.toString());
        expect(user2Upline.get(2n)?.toString()).toEqual(user1RegistrationData.upline.mapping.get(1n)?.toString());
        expect(user2Upline.get(3n)?.toString()).toEqual(undefined);
        expect(user2Upline.get(4n)?.toString()).toEqual(undefined);
        expect(user2Upline.get(5n)?.toString()).toEqual(undefined);
        expect(user2Upline.get(6n)?.toString()).toEqual(undefined);
        expect(user2Upline.get(7n)?.toString()).toEqual(undefined);
        expect(user2Upline.get(8n)?.toString()).toEqual(undefined);

        const user3UplineMapping: Dictionary<bigint, Address> = Dictionary.empty();
        user3UplineMapping.set(1n, user2Wallet.getSender().address);
        user2Upline
            .keys()
            .slice(0, 6)
            .forEach((key, index) => {
                user3UplineMapping.set(BigInt(index + 2), user2Upline.get(key)!);
            });

        const user3RegistrationData = {
            walletAddress: user3Wallet.getSender().address,
            username: 'testUser3',
            upline: {
                $$type: 'Upline' as 'Upline',
                mapping: user3UplineMapping,
                count: BigInt(user3UplineMapping.values().length),
            },
            contractKey: contractKey,
        };

        const user3WalletBalanceBefore = await user3Wallet.getBalance();
        const mainContractBalanceBeforeUser3Registration = await hypersonicMainContract.getBalance();

        const user3RegisterResult = await hypersonicMainContract.send(
            user3Wallet.getSender(),
            {
                value: toNano('0.25'),
            },
            {
                $$type: 'Register',
                ...user3RegistrationData,
            },
        );

        const user3WalletBalanceAfter = await user3Wallet.getBalance();
        const mainContractBalanceAfterUser3Registration = await hypersonicMainContract.getBalance();

        if (showLogs) {
            console.table([
                {
                    Description: 'User 3 Transaction Fees For Registration',
                    'Amount (TON)': (
                        Number(user3WalletBalanceBefore) / Number(toNano(1)) -
                        Number(user3WalletBalanceAfter) / Number(toNano(1))
                    ).toFixed(5),
                },
                {
                    Description: 'Main Contract Transaction Fees After User 3 Registration',
                    'Amount (TON)': (
                        Number(mainContractBalanceBeforeUser3Registration) / Number(toNano(1)) -
                        Number(mainContractBalanceAfterUser3Registration) / Number(toNano(1))
                    ).toFixed(5),
                },
            ]);
        }

        const updatedUser2Data = await user2.getUniLevelUserData();
        expect(updatedUser2Data.invited.mapping.values()[0].toString()).toEqual(
            user3Wallet.getSender().address.toString(),
        );
        expect(updatedUser2Data.invited.count).toEqual(1n);

        const user3Data = await user3.getUniLevelUserData();
        const user3Upline = user3Data.upline.mapping;

        expect(user3Data.username).toEqual(user3RegistrationData.username);
        expect(user3Data.walletAddress.toString()).toEqual(user3Wallet.getSender().address.toString());
        expect(Number(user3Data.upline.count)).toEqual(user3UplineMapping.values().length);

        const numberOfUsersAfterUser3Registration = await hypersonicMainContract.getNumberOfUsers();
        expect(numberOfUsersAfterUser3Registration.toString()).toEqual('4');

        expect(user3Upline.get(1n)?.toString()).toEqual(user2Wallet.getSender().address.toString());
        expect(user3Upline.get(2n)?.toString()).toEqual(user1Wallet.getSender().address.toString());
        expect(user3Upline.get(3n)?.toString()).toEqual(user1RegistrationData.upline.mapping.get(1n)?.toString());
        expect(user2Upline.get(4n)?.toString()).toEqual(undefined);
        expect(user2Upline.get(5n)?.toString()).toEqual(undefined);
        expect(user2Upline.get(6n)?.toString()).toEqual(undefined);
        expect(user2Upline.get(7n)?.toString()).toEqual(undefined);
        expect(user2Upline.get(8n)?.toString()).toEqual(undefined);

        const user4UplineMapping: Dictionary<bigint, Address> = Dictionary.empty();
        user4UplineMapping.set(1n, user3Wallet.getSender().address);
        user3Upline
            .keys()
            .slice(0, 6)
            .forEach((key, index) => {
                user4UplineMapping.set(BigInt(index + 2), user3Upline.get(key)!);
            });

        const user4RegistrationData = {
            walletAddress: user4Wallet.getSender().address,
            username: 'testUser4',
            upline: {
                $$type: 'Upline' as 'Upline',
                mapping: user4UplineMapping,
                count: BigInt(user4UplineMapping.values().length),
            },
            contractKey: contractKey,
        };

        const user4WalletBalanceBefore = await user4Wallet.getBalance();
        const mainContractBalanceBeforeUser4Registration = await hypersonicMainContract.getBalance();

        const user4RegisterResult = await hypersonicMainContract.send(
            user4Wallet.getSender(),
            {
                value: toNano('0.25'),
            },
            {
                $$type: 'Register',
                ...user4RegistrationData,
            },
        );

        const user4WalletBalanceAfter = await user4Wallet.getBalance();
        const mainContractBalanceAfterUser4Registration = await hypersonicMainContract.getBalance();

        if (showLogs) {
            console.table([
                {
                    Description: 'User 4 Transaction Fees For Registration',
                    'Amount (TON)': (
                        Number(user4WalletBalanceBefore) / Number(toNano(1)) -
                        Number(user4WalletBalanceAfter) / Number(toNano(1))
                    ).toFixed(5),
                },
                {
                    Description: 'Main Contract Transaction Fees After User 4 Registration',
                    'Amount (TON)': (
                        Number(mainContractBalanceBeforeUser4Registration) / Number(toNano(1)) -
                        Number(mainContractBalanceAfterUser4Registration) / Number(toNano(1))
                    ).toFixed(5),
                },
            ]);
        }

        const updatedUser3Data = await user3.getUniLevelUserData();
        expect(updatedUser3Data.invited.mapping.values()[0].toString()).toEqual(
            user4Wallet.getSender().address.toString(),
        );
        expect(updatedUser3Data.invited.count).toEqual(1n);

        const user4Data = await user4.getUniLevelUserData();
        const user4Upline = user4Data.upline.mapping;

        expect(user4Data.username).toEqual(user4RegistrationData.username);
        expect(user4Data.walletAddress.toString()).toEqual(user4Wallet.getSender().address.toString());
        expect(Number(user4Data.upline.count)).toEqual(user4UplineMapping.values().length);

        const numberOfUsersAfterUser4Registration = await hypersonicMainContract.getNumberOfUsers();
        expect(numberOfUsersAfterUser4Registration.toString()).toEqual('5');

        expect(user4Upline.get(1n)?.toString()).toEqual(user3Wallet.getSender().address.toString());
        expect(user4Upline.get(2n)?.toString()).toEqual(user2Wallet.getSender().address.toString());
        expect(user4Upline.get(3n)?.toString()).toEqual(user1Wallet.getSender().address.toString());
        expect(user4Upline.get(4n)?.toString()).toEqual(user1RegistrationData.upline.mapping.get(1n)?.toString());
        expect(user2Upline.get(5n)?.toString()).toEqual(undefined);
        expect(user2Upline.get(6n)?.toString()).toEqual(undefined);
        expect(user2Upline.get(7n)?.toString()).toEqual(undefined);
        expect(user2Upline.get(8n)?.toString()).toEqual(undefined);

        const user5UplineMapping: Dictionary<bigint, Address> = Dictionary.empty();
        user5UplineMapping.set(1n, user4Wallet.getSender().address);
        user4Upline
            .keys()
            .slice(0, 6)
            .forEach((key, index) => {
                user5UplineMapping.set(BigInt(index + 2), user4Upline.get(key)!);
            });

        const user5RegistrationData = {
            walletAddress: user5Wallet.getSender().address,
            username: 'testUser5',
            upline: {
                $$type: 'Upline' as 'Upline',
                mapping: user5UplineMapping,
                count: BigInt(user5UplineMapping.values().length),
            },
            contractKey: contractKey,
        };

        const user5WalletBalanceBefore = await user5Wallet.getBalance();
        const mainContractBalanceBeforeUser5Registration = await hypersonicMainContract.getBalance();

        const user5RegisterResult = await hypersonicMainContract.send(
            user5Wallet.getSender(),
            {
                value: toNano('0.25'),
            },
            {
                $$type: 'Register',
                ...user5RegistrationData,
            },
        );

        const user5WalletBalanceAfter = await user5Wallet.getBalance();
        const mainContractBalanceAfterUser5Registration = await hypersonicMainContract.getBalance();

        if (showLogs) {
            console.table([
                {
                    Description: 'User 5 Transaction Fees For Registration',
                    'Amount (TON)': (
                        Number(user5WalletBalanceBefore) / Number(toNano(1)) -
                        Number(user5WalletBalanceAfter) / Number(toNano(1))
                    ).toFixed(5),
                },
                {
                    Description: 'Main Contract Transaction Fees After User 5 Registration',
                    'Amount (TON)': (
                        Number(mainContractBalanceBeforeUser5Registration) / Number(toNano(1)) -
                        Number(mainContractBalanceAfterUser5Registration) / Number(toNano(1))
                    ).toFixed(5),
                },
            ]);
        }

        const updatedUser4Data = await user4.getUniLevelUserData();
        expect(updatedUser4Data.invited.mapping.values()[0].toString()).toEqual(
            user5Wallet.getSender().address.toString(),
        );
        expect(updatedUser4Data.invited.count).toEqual(1n);

        const user5Data = await user5.getUniLevelUserData();
        const user5Upline = user5Data.upline.mapping;

        expect(user5Data.username).toEqual(user5RegistrationData.username);
        expect(user5Data.walletAddress.toString()).toEqual(user5Wallet.getSender().address.toString());
        expect(Number(user5Data.upline.count)).toEqual(user5UplineMapping.values().length);

        const numberOfUsersAfterUser5Registration = await hypersonicMainContract.getNumberOfUsers();
        expect(numberOfUsersAfterUser5Registration.toString()).toEqual('6');

        expect(user5Upline.get(1n)?.toString()).toEqual(user4Wallet.getSender().address.toString());
        expect(user5Upline.get(2n)?.toString()).toEqual(user3Wallet.getSender().address.toString());
        expect(user5Upline.get(3n)?.toString()).toEqual(user2Wallet.getSender().address.toString());
        expect(user5Upline.get(4n)?.toString()).toEqual(user1Wallet.getSender().address.toString());
        expect(user5Upline.get(5n)?.toString()).toEqual(user1RegistrationData.upline.mapping.get(1n)?.toString());
        expect(user2Upline.get(6n)?.toString()).toEqual(undefined);
        expect(user2Upline.get(7n)?.toString()).toEqual(undefined);
        expect(user2Upline.get(8n)?.toString()).toEqual(undefined);

        const user6UplineMapping: Dictionary<bigint, Address> = Dictionary.empty();
        user6UplineMapping.set(1n, user5Wallet.getSender().address);
        user5Upline
            .keys()
            .slice(0, 6)
            .forEach((key, index) => {
                user6UplineMapping.set(BigInt(index + 2), user5Upline.get(key)!);
            });

        const user6RegistrationData = {
            walletAddress: user6Wallet.getSender().address,
            username: 'testUser6',
            upline: {
                $$type: 'Upline' as 'Upline',
                mapping: user6UplineMapping,
                count: BigInt(user6UplineMapping.values().length),
            },
            contractKey: contractKey,
        };

        const user6WalletBalanceBefore = await user6Wallet.getBalance();
        const mainContractBalanceBeforeUser6Registration = await hypersonicMainContract.getBalance();

        const user6RegisterResult = await hypersonicMainContract.send(
            user6Wallet.getSender(),
            {
                value: toNano('0.25'),
            },
            {
                $$type: 'Register',
                ...user6RegistrationData,
            },
        );

        const user6WalletBalanceAfter = await user6Wallet.getBalance();
        const mainContractBalanceAfterUser6Registration = await hypersonicMainContract.getBalance();

        if (showLogs) {
            console.table([
                {
                    Description: 'User 6 Transaction Fees For Registration',
                    'Amount (TON)': (
                        Number(user6WalletBalanceBefore) / Number(toNano(1)) -
                        Number(user6WalletBalanceAfter) / Number(toNano(1))
                    ).toFixed(5),
                },
                {
                    Description: 'Main Contract Transaction Fees After User 6 Registration',
                    'Amount (TON)': (
                        Number(mainContractBalanceBeforeUser6Registration) / Number(toNano(1)) -
                        Number(mainContractBalanceAfterUser6Registration) / Number(toNano(1))
                    ).toFixed(5),
                },
            ]);
        }

        const updatedUser5Data = await user5.getUniLevelUserData();
        expect(updatedUser5Data.invited.mapping.values()[0].toString()).toEqual(
            user6Wallet.getSender().address.toString(),
        );
        expect(updatedUser5Data.invited.count).toEqual(1n);

        const user6Data = await user6.getUniLevelUserData();
        const user6Upline = user6Data.upline.mapping;

        expect(user6Data.username).toEqual(user6RegistrationData.username);
        expect(user6Data.walletAddress.toString()).toEqual(user6Wallet.getSender().address.toString());
        expect(Number(user6Data.upline.count)).toEqual(user6UplineMapping.values().length);

        const numberOfUsersAfterUser6Registration = await hypersonicMainContract.getNumberOfUsers();
        expect(numberOfUsersAfterUser6Registration.toString()).toEqual('7');

        expect(user6Upline.get(1n)?.toString()).toEqual(user5Wallet.getSender().address.toString());
        expect(user6Upline.get(2n)?.toString()).toEqual(user4Wallet.getSender().address.toString());
        expect(user6Upline.get(3n)?.toString()).toEqual(user3Wallet.getSender().address.toString());
        expect(user6Upline.get(4n)?.toString()).toEqual(user2Wallet.getSender().address.toString());
        expect(user6Upline.get(5n)?.toString()).toEqual(user1Wallet.getSender().address.toString());
        expect(user6Upline.get(6n)?.toString()).toEqual(user1RegistrationData.upline.mapping.get(1n)?.toString());
        expect(user6Upline.get(7n)?.toString()).toEqual(undefined);
        expect(user6Upline.get(8n)?.toString()).toEqual(undefined);

        const user7UplineMapping: Dictionary<bigint, Address> = Dictionary.empty();
        user7UplineMapping.set(1n, user6Wallet.getSender().address);
        user6Upline
            .keys()
            .slice(0, 6)
            .forEach((key, index) => {
                user7UplineMapping.set(BigInt(index + 2), user6Upline.get(key)!);
            });

        const user7RegistrationData = {
            walletAddress: user7Wallet.getSender().address,
            username: 'testUser7',
            upline: {
                $$type: 'Upline' as 'Upline',
                mapping: user7UplineMapping,
                count: BigInt(user7UplineMapping.values().length),
            },
            contractKey: contractKey,
        };

        const user7WalletBalanceBefore = await user7Wallet.getBalance();
        const mainContractBalanceBeforeUser7Registration = await hypersonicMainContract.getBalance();

        const user7RegisterResult = await hypersonicMainContract.send(
            user7Wallet.getSender(),
            {
                value: toNano('0.25'),
            },
            {
                $$type: 'Register',
                ...user7RegistrationData,
            },
        );

        const user7WalletBalanceAfter = await user7Wallet.getBalance();
        const mainContractBalanceAfterUser7Registration = await hypersonicMainContract.getBalance();

        if (showLogs) {
            console.table([
                {
                    Description: 'User 7 Transaction Fees For Registration',
                    'Amount (TON)': (
                        Number(user7WalletBalanceBefore) / Number(toNano(1)) -
                        Number(user7WalletBalanceAfter) / Number(toNano(1))
                    ).toFixed(5),
                },
                {
                    Description: 'Main Contract Transaction Fees After User 7 Registration',
                    'Amount (TON)': (
                        Number(mainContractBalanceBeforeUser7Registration) / Number(toNano(1)) -
                        Number(mainContractBalanceAfterUser7Registration) / Number(toNano(1))
                    ).toFixed(5),
                },
            ]);
        }

        const updatedUser6Data = await user6.getUniLevelUserData();
        expect(updatedUser6Data.invited.mapping.values()[0].toString()).toEqual(
            user7Wallet.getSender().address.toString(),
        );
        expect(updatedUser6Data.invited.count).toEqual(1n);

        const user7Data = await user7.getUniLevelUserData();
        const user7Upline = user7Data.upline.mapping;

        expect(user7Data.username).toEqual(user7RegistrationData.username);
        expect(user7Data.walletAddress.toString()).toEqual(user7Wallet.getSender().address.toString());
        expect(Number(user7Data.upline.count)).toEqual(user7UplineMapping.values().length);

        const numberOfUsersAfterUser7Registration = await hypersonicMainContract.getNumberOfUsers();
        expect(numberOfUsersAfterUser7Registration.toString()).toEqual('8');

        expect(user7Upline.get(1n)?.toString()).toEqual(user6Wallet.getSender().address.toString());
        expect(user7Upline.get(2n)?.toString()).toEqual(user5Wallet.getSender().address.toString());
        expect(user7Upline.get(3n)?.toString()).toEqual(user4Wallet.getSender().address.toString());
        expect(user7Upline.get(4n)?.toString()).toEqual(user3Wallet.getSender().address.toString());
        expect(user7Upline.get(5n)?.toString()).toEqual(user2Wallet.getSender().address.toString());
        expect(user7Upline.get(6n)?.toString()).toEqual(user1Wallet.getSender().address.toString());
        expect(user7Upline.get(7n)?.toString()).toEqual(user1RegistrationData.upline.mapping.get(1n)?.toString());
        expect(user7Upline.get(8n)?.toString()).toEqual(undefined);

        const user8UplineMapping: Dictionary<bigint, Address> = Dictionary.empty();
        user8UplineMapping.set(1n, user7Wallet.getSender().address);
        user7Upline
            .keys()
            .slice(0, 6)
            .forEach((key, index) => {
                user8UplineMapping.set(BigInt(index + 2), user7Upline.get(key)!);
            });

        const user8RegistrationData = {
            walletAddress: user8Wallet.getSender().address,
            username: 'testUser8',
            upline: {
                $$type: 'Upline' as 'Upline',
                mapping: user8UplineMapping,
                count: BigInt(user8UplineMapping.values().length),
            },
            contractKey: contractKey,
        };

        const user8WalletBalanceBefore = await user8Wallet.getBalance();
        const mainContractBalanceBeforeUser8Registration = await hypersonicMainContract.getBalance();

        const user8RegisterResult = await hypersonicMainContract.send(
            user8Wallet.getSender(),
            {
                value: toNano('0.25'),
            },
            {
                $$type: 'Register',
                ...user8RegistrationData,
            },
        );

        const user8WalletBalanceAfter = await user8Wallet.getBalance();
        const mainContractBalanceAfterUser8Registration = await hypersonicMainContract.getBalance();
        if (showLogs) {
            console.table([
                {
                    Description: 'User 8 Transaction Fees For Registration',
                    'Amount (TON)': (
                        Number(user8WalletBalanceBefore) / Number(toNano(1)) -
                        Number(user8WalletBalanceAfter) / Number(toNano(1))
                    ).toFixed(5),
                },
                {
                    Description: 'Main Contract Transaction Fees After User 8 Registration',
                    'Amount (TON)': (
                        Number(mainContractBalanceBeforeUser8Registration) / Number(toNano(1)) -
                        Number(mainContractBalanceAfterUser8Registration) / Number(toNano(1))
                    ).toFixed(5),
                },
            ]);
        }

        const updatedUser7Data = await user7.getUniLevelUserData();
        expect(updatedUser7Data.invited.mapping.values()[0].toString()).toEqual(
            user8Wallet.getSender().address.toString(),
        );
        expect(updatedUser7Data.invited.count).toEqual(1n);

        const user8Data = await user8.getUniLevelUserData();
        const user8Upline = user8Data.upline.mapping;

        expect(user8Data.username).toEqual(user8RegistrationData.username);
        expect(user8Data.walletAddress.toString()).toEqual(user8Wallet.getSender().address.toString());
        expect(Number(user8Data.upline.count)).toEqual(user8UplineMapping.values().length);

        const numberOfUsersAfterUser8Registration = await hypersonicMainContract.getNumberOfUsers();
        expect(numberOfUsersAfterUser8Registration.toString()).toEqual('9');

        expect(user8Upline.get(1n)?.toString()).toEqual(user7Wallet.getSender().address.toString());
        expect(user8Upline.get(2n)?.toString()).toEqual(user6Wallet.getSender().address.toString());
        expect(user8Upline.get(3n)?.toString()).toEqual(user5Wallet.getSender().address.toString());
        expect(user8Upline.get(4n)?.toString()).toEqual(user4Wallet.getSender().address.toString());
        expect(user8Upline.get(5n)?.toString()).toEqual(user3Wallet.getSender().address.toString());
        expect(user8Upline.get(6n)?.toString()).toEqual(user2Wallet.getSender().address.toString());
        expect(user8Upline.get(7n)?.toString()).toEqual(user1Wallet.getSender().address.toString());
        expect(user8Upline.get(8n)?.toString()).toEqual(undefined);

        const user9UplineMapping: Dictionary<bigint, Address> = Dictionary.empty();
        user9UplineMapping.set(1n, user7Wallet.getSender().address);
        user8Upline
            .keys()
            .slice(0, 6)
            .forEach((key, index) => {
                user9UplineMapping.set(BigInt(index + 2), user7Upline.get(key)!);
            });

        const user9RegistrationData = {
            walletAddress: user9Wallet.getSender().address,
            username: 'testUser9',
            upline: {
                $$type: 'Upline' as 'Upline',
                mapping: user9UplineMapping,
                count: BigInt(user9UplineMapping.values().length),
            },
            contractKey: contractKey,
        };

        const user9WalletBalanceBefore = await user9Wallet.getBalance();
        const mainContractBalanceBeforeUser9Registration = await hypersonicMainContract.getBalance();

        const user9RegisterResult = await hypersonicMainContract.send(
            user9Wallet.getSender(),
            {
                value: toNano('0.25'),
            },
            {
                $$type: 'Register',
                ...user9RegistrationData,
            },
        );

        const user9WalletBalanceAfter = await user9Wallet.getBalance();
        const mainContractBalanceAfterUser9Registration = await hypersonicMainContract.getBalance();

        if (showLogs) {
            console.table([
                {
                    Description: 'User 9 Transaction Fees For Registration',
                    'Amount (TON)': (
                        Number(user9WalletBalanceBefore) / Number(toNano(1)) -
                        Number(user9WalletBalanceAfter) / Number(toNano(1))
                    ).toFixed(5),
                },
                {
                    Description: 'Main Contract Transaction Fees After User 9 Registration',
                    'Amount (TON)': (
                        Number(mainContractBalanceBeforeUser9Registration) / Number(toNano(1)) -
                        Number(mainContractBalanceAfterUser9Registration) / Number(toNano(1))
                    ).toFixed(5),
                },
            ]);
        }

        const updatedUser7DataAfterUser9 = await user7.getUniLevelUserData();
        expect(updatedUser7DataAfterUser9.invited.mapping.values()[0].toString()).toEqual(
            user8Wallet.getSender().address.toString(),
        );
        expect(updatedUser7DataAfterUser9.invited.mapping.values()[1].toString()).toEqual(
            user9Wallet.getSender().address.toString(),
        );
        expect(updatedUser7DataAfterUser9.invited.count).toEqual(2n);

        const user9Data = await user9.getUniLevelUserData();
        const user9Upline = user9Data.upline.mapping;

        expect(user9Data.username).toEqual(user9RegistrationData.username);
        expect(user9Data.walletAddress.toString()).toEqual(user9Wallet.getSender().address.toString());
        expect(Number(user9Data.upline.count)).toEqual(user9UplineMapping.values().length);

        const numberOfUsersAfterUser9Registration = await hypersonicMainContract.getNumberOfUsers();
        expect(numberOfUsersAfterUser9Registration.toString()).toEqual('10');

        expect(user9Upline.get(1n)?.toString()).toEqual(user7Wallet.getSender().address.toString());
        expect(user9Upline.get(2n)?.toString()).toEqual(user6Wallet.getSender().address.toString());
        expect(user9Upline.get(3n)?.toString()).toEqual(user5Wallet.getSender().address.toString());
        expect(user9Upline.get(4n)?.toString()).toEqual(user4Wallet.getSender().address.toString());
        expect(user9Upline.get(5n)?.toString()).toEqual(user3Wallet.getSender().address.toString());
        expect(user9Upline.get(6n)?.toString()).toEqual(user2Wallet.getSender().address.toString());
        expect(user9Upline.get(7n)?.toString()).toEqual(user1Wallet.getSender().address.toString());
        expect(user9Upline.get(8n)?.toString()).toEqual(undefined);
    };

    const depositBalanceForTestUsers = async (depositAmount: number, showLogs = false) => {
        const userWallets = [
            user1Wallet,
            user2Wallet,
            user3Wallet,
            user4Wallet,
            user5Wallet,
            user6Wallet,
            user7Wallet,
            user8Wallet,
            user9Wallet,
        ];

        for (let i = 0; i < userWallets.length; i++) {
            const userWallet = userWallets[i];
            const user = blockchain.openContract(await HypersonicUserContract.fromInit(userWallet.getSender().address));

            const senderWalletBalanceBefore = await userWallet.getBalance();
            const contractBalanceBefore = await hypersonicMainContract.getBalance();

            await hypersonicMainContract.send(
                userWallet.getSender(),
                { value: toNano(depositAmount + 0.25) },
                {
                    $$type: 'Deposit',
                    walletAddress: userWallet.getSender().address,
                    amount: toNano(depositAmount),
                    contractKey: contractKey,
                },
            );

            const senderWalletBalanceAfter = await userWallet.getBalance();
            const contractBalanceAfter = await hypersonicMainContract.getBalance();

            expect(Number(fromNano(senderWalletBalanceAfter))).toBeCloseTo(
                Number(fromNano(senderWalletBalanceBefore)) - depositAmount,
                0,
            );

            if (showLogs) {
                console.log('-------------------------------------------------');
                console.table([
                    {
                        Description: 'User Transaction Fees For Depositing',
                        'Amount (TON)': (
                            Number(senderWalletBalanceBefore) / Number(toNano(1)) -
                            Number(senderWalletBalanceAfter) / Number(toNano(1)) -
                            depositAmount
                        ).toFixed(5),
                    },
                    {
                        Description: 'Main Contract Computation Fees For Depositing',
                        'Amount (TON)': (
                            Number(contractBalanceBefore) / Number(toNano(1)) -
                            Number(contractBalanceAfter) / Number(toNano(1)) +
                            depositAmount
                        ).toFixed(5),
                    },
                    {
                        Description: 'User Contract Balance After Depositing',
                        'Amount (TON)': (Number(await user1.getBalance()) / Number(toNano(1))).toFixed(5),
                    },
                ]);
            }

            const userData = await user.getUniLevelUserData();
            const retrievedBalance = userData.balance;
            expect(retrievedBalance).toEqual(toNano(depositAmount));

            const mainContractBalance = await hypersonicMainContract.getBalance();
            expect(mainContractBalance).toBeGreaterThanOrEqual(toNano(depositAmount));

            const userContractBalance = await user.getBalance();
            expect(userContractBalance).toBeGreaterThan(toNano(0));
        }
    };

    const checkUpgradePlans = async (showLogs = false) => {
        const getPayoutAmount = (packagePrice: number, payoutPercentage: number) => {
            return (packagePrice * payoutPercentage) / 100;
        };

        const userWallets = [
            user1Wallet,
            user2Wallet,
            user3Wallet,
            user4Wallet,
            user5Wallet,
            user6Wallet,
            user7Wallet,
            user8Wallet,
            user9Wallet,
        ];

        const users = await Promise.all(
            userWallets.map(async (wallet) => {
                return blockchain.openContract(await HypersonicUserContract.fromInit(wallet.getSender().address));
            }),
        );

        const balanceAfterPayingForPackage1 = toNano('100') - toNano('3');

        const firstLevelFirstPackagePayoutAmount = BigInt(getPayoutAmount(Number(toNano('3')), 10));
        const secondLevelFirstPackagePayoutAmount = BigInt(getPayoutAmount(Number(toNano('3')), 20));
        const thirdLevelFirstPackagePayoutAmount = BigInt(getPayoutAmount(Number(toNano('3')), 20));
        const fourthLevelFirstPackagePayoutAmount = BigInt(getPayoutAmount(Number(toNano('3')), 10));
        const fifthLevelFirstPackagePayoutAmount = BigInt(getPayoutAmount(Number(toNano('3')), 10));
        const sixthLevelFirstPackagePayoutAmount = BigInt(getPayoutAmount(Number(toNano('3')), 10));
        const seventhLevelFirstPackagePayoutAmount = BigInt(getPayoutAmount(Number(toNano('3')), 10));

        for (const user of users) {
            const userData = await user.getUniLevelUserData();

            expect(userData.balance).toEqual(toNano('100'));
            expect(userData.packageLevel).toEqual(0n);
        }

        const user1UplinesPackageLevelsMapping: Dictionary<bigint, bigint> = Dictionary.empty();

        let companyWalletBalanceBefore = await companyWallet.getBalance();
        let userWalletBalanceBefore = await user1Wallet.getBalance();
        let mainContractBalanceBefore = await hypersonicMainContract.getBalance();
        let userContractBalanceBefore = await user1.getBalance();

        let user1DataForDistribution = await users[0].getUniLevelUserData();

        await upgradeUserUnilevel(
            user1Wallet,
            user1DataForDistribution,
            user1UplinesPackageLevelsMapping,
            1,
            contractKey,
            hypersonicMainContract,
        );

        let companyWalletBalanceAfter = await companyWallet.getBalance();
        let userWalletBalanceAfter = await user1Wallet.getBalance();
        let mainContractBalanceAfter = await hypersonicMainContract.getBalance();
        let userContractBalanceAfter = await user1.getBalance();

        if (showLogs) {
            console.log('-------------------------------------------------');

            console.log('User 1 Upgrade Fees:');
            console.table([
                {
                    Description: 'User 1 Wallet Balance Fees',
                    'Amount (TON)': (
                        Number(userWalletBalanceBefore) / Number(toNano(1)) -
                        Number(userWalletBalanceAfter) / Number(toNano(1))
                    ).toFixed(5),
                },
                {
                    Description: 'Main Contract Balance Fees',
                    'Amount (TON)': (
                        Number(mainContractBalanceBefore) / Number(toNano(1)) -
                        Number(mainContractBalanceAfter) / Number(toNano(1))
                    ).toFixed(5),
                },
                {
                    Description: 'User 1 Contract Balance Fees',
                    'Amount (TON)': (
                        Number(userContractBalanceBefore) / Number(toNano(1)) -
                        Number(userContractBalanceAfter) / Number(toNano(1))
                    ).toFixed(5),
                },
                {
                    Description: 'Company Wallet Profit',
                    'Amount (TON)': (
                        Number(companyWalletBalanceAfter) / Number(toNano(1)) -
                        Number(companyWalletBalanceBefore) / Number(toNano(1))
                    ).toFixed(5),
                },
            ]);
        }

        expect(Number(fromNano(userWalletBalanceAfter))).toBeCloseTo(Number(fromNano(userWalletBalanceBefore)), 0);

        expect(Number(fromNano(companyWalletBalanceAfter))).toBeCloseTo(
            Number(fromNano(Number(companyWalletBalanceBefore) + Number(getPayoutAmount(Number(toNano('3')), 100)))),
            1,
        );

        let user1Data = await users[0].getUniLevelUserData();

        expect(user1Data.packageLevel).toEqual(1n);
        expect(user1Data.balance).toEqual(balanceAfterPayingForPackage1);

        const user2UplinesPackageLevelsMapping: Dictionary<bigint, bigint> = Dictionary.empty();

        user2UplinesPackageLevelsMapping.set(1n, user1Data.packageLevel);

        companyWalletBalanceBefore = await companyWallet.getBalance();
        userWalletBalanceBefore = await user2Wallet.getBalance();
        mainContractBalanceBefore = await hypersonicMainContract.getBalance();
        userContractBalanceBefore = await users[1].getBalance();

        let user2DataForDistribution = await users[1].getUniLevelUserData();

        await upgradeUserUnilevel(
            user2Wallet,
            user2DataForDistribution,
            user2UplinesPackageLevelsMapping,
            1,
            contractKey,
            hypersonicMainContract,
        );

        companyWalletBalanceAfter = await companyWallet.getBalance();
        userWalletBalanceAfter = await user2Wallet.getBalance();
        mainContractBalanceAfter = await hypersonicMainContract.getBalance();
        userContractBalanceAfter = await users[1].getBalance();

        if (showLogs) {
            console.log('User 2 Upgrade Fees:');
            console.table([
                {
                    Description: 'User 2 Wallet Balance Fees',
                    'Amount (TON)': (
                        Number(userWalletBalanceBefore) / Number(toNano(1)) -
                        Number(userWalletBalanceAfter) / Number(toNano(1))
                    ).toFixed(5),
                },
                {
                    Description: 'Main Contract Balance Fees',
                    'Amount (TON)': (
                        Number(mainContractBalanceBefore) / Number(toNano(1)) -
                        Number(mainContractBalanceAfter) / Number(toNano(1))
                    ).toFixed(5),
                },
                {
                    Description: 'User 2 Contract Balance Fees',
                    'Amount (TON)': (
                        Number(userContractBalanceBefore) / Number(toNano(1)) -
                        Number(userContractBalanceAfter) / Number(toNano(1))
                    ).toFixed(5),
                },
                {
                    Description: 'Company Wallet Profit',
                    'Amount (TON)': (
                        Number(companyWalletBalanceAfter) / Number(toNano(1)) -
                        Number(companyWalletBalanceBefore) / Number(toNano(1))
                    ).toFixed(5),
                },
            ]);
        }

        expect(Number(fromNano(userWalletBalanceAfter))).toBeCloseTo(Number(fromNano(userWalletBalanceBefore)), 0);

        expect(Number(fromNano(companyWalletBalanceAfter))).toBeCloseTo(
            Number(
                fromNano(
                    Number(companyWalletBalanceBefore) + Number(getPayoutAmount(Number(toNano('3')), 90)), // 10% goes to user 1
                ),
            ),
            1,
        );

        let user2Data = await users[1].getUniLevelUserData();

        expect(user2Data.packageLevel).toEqual(1n);
        expect(user2Data.balance).toEqual(balanceAfterPayingForPackage1);

        user1Data = await users[0].getUniLevelUserData();

        expect(user1Data.balance).toEqual(balanceAfterPayingForPackage1 + firstLevelFirstPackagePayoutAmount);

        companyWalletBalanceBefore = await companyWallet.getBalance();
        userWalletBalanceBefore = await user3Wallet.getBalance();
        mainContractBalanceBefore = await hypersonicMainContract.getBalance();
        userContractBalanceBefore = await users[2].getBalance();

        const user3UplinesPackageLevelsMapping: Dictionary<bigint, bigint> = Dictionary.empty();

        user3UplinesPackageLevelsMapping.set(1n, user2Data.packageLevel);
        user3UplinesPackageLevelsMapping.set(2n, user1Data.packageLevel);

        let user3DataForDistribution = await users[2].getUniLevelUserData();

        await upgradeUserUnilevel(
            user3Wallet,
            user3DataForDistribution,
            user3UplinesPackageLevelsMapping,
            1,
            contractKey,
            hypersonicMainContract,
        );

        companyWalletBalanceAfter = await companyWallet.getBalance();
        userWalletBalanceAfter = await user3Wallet.getBalance();
        mainContractBalanceAfter = await hypersonicMainContract.getBalance();
        userContractBalanceAfter = await users[2].getBalance();

        if (showLogs) {
            console.log('User 3 Upgrade Fees:');
            console.table([
                {
                    Description: 'User 3 Wallet Balance Fees',
                    'Amount (TON)': (
                        Number(userWalletBalanceBefore) / Number(toNano(1)) -
                        Number(userWalletBalanceAfter) / Number(toNano(1))
                    ).toFixed(5),
                },
                {
                    Description: 'Main Contract Balance Fees',
                    'Amount (TON)': (
                        Number(mainContractBalanceBefore) / Number(toNano(1)) -
                        Number(mainContractBalanceAfter) / Number(toNano(1))
                    ).toFixed(5),
                },
                {
                    Description: 'User 3 Contract Balance Fees',
                    'Amount (TON)': (
                        Number(userContractBalanceBefore) / Number(toNano(1)) -
                        Number(userContractBalanceAfter) / Number(toNano(1))
                    ).toFixed(5),
                },
                {
                    Description: 'Company Wallet Profit',
                    'Amount (TON)': (
                        Number(companyWalletBalanceAfter) / Number(toNano(1)) -
                        Number(companyWalletBalanceBefore) / Number(toNano(1))
                    ).toFixed(5),
                },
            ]);
        }

        expect(Number(fromNano(userWalletBalanceAfter))).toBeCloseTo(Number(fromNano(userWalletBalanceBefore)), 0);

        expect(Number(fromNano(companyWalletBalanceAfter))).toBeCloseTo(
            Number(fromNano(Number(companyWalletBalanceBefore) + Number(getPayoutAmount(Number(toNano('3')), 70)))), // 10% goes to user 2, 20% goes to user 1
            1,
        );

        let user3Data = await users[2].getUniLevelUserData();

        expect(user3Data.packageLevel).toEqual(1n);
        expect(user3Data.balance).toEqual(balanceAfterPayingForPackage1);

        user1Data = await users[0].getUniLevelUserData();
        user2Data = await users[1].getUniLevelUserData();

        expect(user2Data.balance).toEqual(balanceAfterPayingForPackage1 + firstLevelFirstPackagePayoutAmount);
        expect(user1Data.balance).toEqual(
            balanceAfterPayingForPackage1 + firstLevelFirstPackagePayoutAmount + secondLevelFirstPackagePayoutAmount,
        );

        const user4UplinesPackageLevelsMapping: Dictionary<bigint, bigint> = Dictionary.empty();

        user4UplinesPackageLevelsMapping.set(1n, user3Data.packageLevel);
        user4UplinesPackageLevelsMapping.set(2n, user2Data.packageLevel);
        user4UplinesPackageLevelsMapping.set(3n, user1Data.packageLevel);

        companyWalletBalanceBefore = await companyWallet.getBalance();
        userWalletBalanceBefore = await user4Wallet.getBalance();
        mainContractBalanceBefore = await hypersonicMainContract.getBalance();
        userContractBalanceBefore = await users[3].getBalance();

        let user4DataForDistribution = await users[3].getUniLevelUserData();

        await upgradeUserUnilevel(
            user4Wallet,
            user4DataForDistribution,
            user4UplinesPackageLevelsMapping,
            1,
            contractKey,
            hypersonicMainContract,
        );

        companyWalletBalanceAfter = await companyWallet.getBalance();
        userWalletBalanceAfter = await user2Wallet.getBalance();
        mainContractBalanceAfter = await hypersonicMainContract.getBalance();
        userContractBalanceAfter = await users[1].getBalance();

        if (showLogs) {
            console.log('User 4 Upgrade Fees:');
            console.table([
                {
                    Description: 'User 4 Wallet Balance Fees',
                    'Amount (TON)': (
                        Number(userWalletBalanceBefore) / Number(toNano(1)) -
                        Number(userWalletBalanceAfter) / Number(toNano(1))
                    ).toFixed(5),
                },
                {
                    Description: 'Main Contract Balance Fees',
                    'Amount (TON)': (
                        Number(mainContractBalanceBefore) / Number(toNano(1)) -
                        Number(mainContractBalanceAfter) / Number(toNano(1))
                    ).toFixed(5),
                },
                {
                    Description: 'User 4 Contract Balance Fees',
                    'Amount (TON)': (
                        Number(userContractBalanceBefore) / Number(toNano(1)) -
                        Number(userContractBalanceAfter) / Number(toNano(1))
                    ).toFixed(5),
                },
                {
                    Description: 'Company Wallet Profit',
                    'Amount (TON)': (
                        Number(companyWalletBalanceAfter) / Number(toNano(1)) -
                        Number(companyWalletBalanceBefore) / Number(toNano(1))
                    ).toFixed(5),
                },
            ]);
        }

        expect(Number(fromNano(userWalletBalanceAfter))).toBeCloseTo(Number(fromNano(userWalletBalanceBefore)), 0);

        expect(Number(fromNano(companyWalletBalanceAfter))).toBeCloseTo(
            Number(
                fromNano(
                    Number(companyWalletBalanceBefore) + Number(getPayoutAmount(Number(toNano('3')), 50)), // 10% goes to user 3, 20% goes to user 2, 20% goes to user 3
                ),
            ),
            1,
        );

        let user4Data = await users[3].getUniLevelUserData();

        expect(user4Data.packageLevel).toEqual(1n);
        expect(user4Data.balance).toEqual(balanceAfterPayingForPackage1);

        user1Data = await users[0].getUniLevelUserData();
        user2Data = await users[1].getUniLevelUserData();
        user3Data = await users[2].getUniLevelUserData();

        expect(user3Data.balance).toEqual(balanceAfterPayingForPackage1 + firstLevelFirstPackagePayoutAmount);
        expect(user2Data.balance).toEqual(
            balanceAfterPayingForPackage1 + firstLevelFirstPackagePayoutAmount + secondLevelFirstPackagePayoutAmount,
        );
        expect(user1Data.balance).toEqual(
            balanceAfterPayingForPackage1 +
                firstLevelFirstPackagePayoutAmount +
                secondLevelFirstPackagePayoutAmount +
                thirdLevelFirstPackagePayoutAmount,
        );

        const user5UplinesPackageLevelsMapping: Dictionary<bigint, bigint> = Dictionary.empty();

        user5UplinesPackageLevelsMapping.set(1n, user4Data.packageLevel);
        user5UplinesPackageLevelsMapping.set(2n, user3Data.packageLevel);
        user5UplinesPackageLevelsMapping.set(3n, user2Data.packageLevel);
        user5UplinesPackageLevelsMapping.set(4n, user1Data.packageLevel);

        companyWalletBalanceBefore = await companyWallet.getBalance();
        userWalletBalanceBefore = await user5Wallet.getBalance();
        mainContractBalanceBefore = await hypersonicMainContract.getBalance();
        userContractBalanceBefore = await users[4].getBalance();

        let user5DataForDistribution = await users[4].getUniLevelUserData();

        await upgradeUserUnilevel(
            user5Wallet,
            user5DataForDistribution,
            user5UplinesPackageLevelsMapping,
            1,
            contractKey,
            hypersonicMainContract,
        );

        companyWalletBalanceAfter = await companyWallet.getBalance();
        userWalletBalanceAfter = await user5Wallet.getBalance();
        mainContractBalanceAfter = await hypersonicMainContract.getBalance();
        userContractBalanceAfter = await users[4].getBalance();

        if (showLogs) {
            console.log('User 5 Upgrade Fees:');
            console.table([
                {
                    Description: 'User 5 Wallet Balance Fees',
                    'Amount (TON)': (
                        Number(userWalletBalanceBefore) / Number(toNano(1)) -
                        Number(userWalletBalanceAfter) / Number(toNano(1))
                    ).toFixed(5),
                },
                {
                    Description: 'Main Contract Balance Fees',
                    'Amount (TON)': (
                        Number(mainContractBalanceBefore) / Number(toNano(1)) -
                        Number(mainContractBalanceAfter) / Number(toNano(1))
                    ).toFixed(5),
                },
                {
                    Description: 'User 5 Contract Balance Fees',
                    'Amount (TON)': (
                        Number(userContractBalanceBefore) / Number(toNano(1)) -
                        Number(userContractBalanceAfter) / Number(toNano(1))
                    ).toFixed(5),
                },
                {
                    Description: 'Company Wallet Profit',
                    'Amount (TON)': (
                        Number(companyWalletBalanceAfter) / Number(toNano(1)) -
                        Number(companyWalletBalanceBefore) / Number(toNano(1))
                    ).toFixed(5),
                },
            ]);
        }

        expect(Number(fromNano(userWalletBalanceAfter))).toBeCloseTo(Number(fromNano(userWalletBalanceBefore)), 0);

        expect(Number(fromNano(companyWalletBalanceAfter))).toBeCloseTo(
            Number(
                fromNano(
                    Number(companyWalletBalanceBefore) + Number(getPayoutAmount(Number(toNano('3')), 40)), // 10% goes to user 4, 20% goes to user 3, 20% goes to user 2, 10% goes to user 1
                ),
            ),
            1,
        );

        let user5Data = await users[4].getUniLevelUserData();

        expect(user5Data.packageLevel).toEqual(1n);
        expect(user5Data.balance).toEqual(balanceAfterPayingForPackage1);

        user1Data = await users[0].getUniLevelUserData();
        user2Data = await users[1].getUniLevelUserData();
        user3Data = await users[2].getUniLevelUserData();
        user4Data = await users[3].getUniLevelUserData();

        expect(user4Data.balance).toEqual(balanceAfterPayingForPackage1 + firstLevelFirstPackagePayoutAmount);
        expect(user3Data.balance).toEqual(
            balanceAfterPayingForPackage1 + firstLevelFirstPackagePayoutAmount + secondLevelFirstPackagePayoutAmount,
        );
        expect(user2Data.balance).toEqual(
            balanceAfterPayingForPackage1 +
                firstLevelFirstPackagePayoutAmount +
                secondLevelFirstPackagePayoutAmount +
                thirdLevelFirstPackagePayoutAmount,
        );
        expect(user1Data.balance).toEqual(
            balanceAfterPayingForPackage1 +
                firstLevelFirstPackagePayoutAmount +
                secondLevelFirstPackagePayoutAmount +
                thirdLevelFirstPackagePayoutAmount +
                fourthLevelFirstPackagePayoutAmount,
        );

        const user6UplinesPackageLevelsMapping: Dictionary<bigint, bigint> = Dictionary.empty();

        user6UplinesPackageLevelsMapping.set(1n, user5Data.packageLevel);
        user6UplinesPackageLevelsMapping.set(2n, user4Data.packageLevel);
        user6UplinesPackageLevelsMapping.set(3n, user3Data.packageLevel);
        user6UplinesPackageLevelsMapping.set(4n, user2Data.packageLevel);
        user6UplinesPackageLevelsMapping.set(5n, user1Data.packageLevel);

        companyWalletBalanceBefore = await companyWallet.getBalance();
        userWalletBalanceBefore = await user6Wallet.getBalance();
        mainContractBalanceBefore = await hypersonicMainContract.getBalance();
        userContractBalanceBefore = await users[5].getBalance();

        let user6DataForDistribution = await users[5].getUniLevelUserData();

        await upgradeUserUnilevel(
            user6Wallet,
            user6DataForDistribution,
            user6UplinesPackageLevelsMapping,
            1,
            contractKey,
            hypersonicMainContract,
        );

        companyWalletBalanceAfter = await companyWallet.getBalance();
        userWalletBalanceAfter = await user6Wallet.getBalance();
        mainContractBalanceAfter = await hypersonicMainContract.getBalance();
        userContractBalanceAfter = await users[5].getBalance();

        if (showLogs) {
            console.log('User 6 Upgrade Fees:');
            console.table([
                {
                    Description: 'User 6 Wallet Balance Fees',
                    'Amount (TON)': (
                        Number(userWalletBalanceBefore) / Number(toNano(1)) -
                        Number(userWalletBalanceAfter) / Number(toNano(1))
                    ).toFixed(5),
                },
                {
                    Description: 'Main Contract Balance Fees',
                    'Amount (TON)': (
                        Number(mainContractBalanceBefore) / Number(toNano(1)) -
                        Number(mainContractBalanceAfter) / Number(toNano(1))
                    ).toFixed(5),
                },
                {
                    Description: 'User 6 Contract Balance Fees',
                    'Amount (TON)': (
                        Number(userContractBalanceBefore) / Number(toNano(1)) -
                        Number(userContractBalanceAfter) / Number(toNano(1))
                    ).toFixed(5),
                },
                {
                    Description: 'Company Wallet Profit',
                    'Amount (TON)': (
                        Number(companyWalletBalanceAfter) / Number(toNano(1)) -
                        Number(companyWalletBalanceBefore) / Number(toNano(1))
                    ).toFixed(5),
                },
            ]);
        }

        expect(Number(fromNano(userWalletBalanceAfter))).toBeCloseTo(Number(fromNano(userWalletBalanceBefore)), 0);

        expect(Number(fromNano(companyWalletBalanceAfter))).toBeCloseTo(
            Number(
                fromNano(
                    Number(companyWalletBalanceBefore) + Number(getPayoutAmount(Number(toNano('3')), 30)), // 10% goes to user 5, 20% goes to user 4, 20% goes to user 3, 10% goes to user 2, 10% goes to user 1
                ),
            ),
            1,
        );

        let user6Data = await users[5].getUniLevelUserData();

        expect(user6Data.packageLevel).toEqual(1n);
        expect(user6Data.balance).toEqual(balanceAfterPayingForPackage1);

        user1Data = await users[0].getUniLevelUserData();
        user2Data = await users[1].getUniLevelUserData();
        user3Data = await users[2].getUniLevelUserData();
        user4Data = await users[3].getUniLevelUserData();
        user5Data = await users[4].getUniLevelUserData();

        expect(user5Data.balance).toEqual(balanceAfterPayingForPackage1 + firstLevelFirstPackagePayoutAmount);
        expect(user4Data.balance).toEqual(
            balanceAfterPayingForPackage1 + firstLevelFirstPackagePayoutAmount + secondLevelFirstPackagePayoutAmount,
        );
        expect(user3Data.balance).toEqual(
            balanceAfterPayingForPackage1 +
                firstLevelFirstPackagePayoutAmount +
                secondLevelFirstPackagePayoutAmount +
                thirdLevelFirstPackagePayoutAmount,
        );
        expect(user2Data.balance).toEqual(
            balanceAfterPayingForPackage1 +
                firstLevelFirstPackagePayoutAmount +
                secondLevelFirstPackagePayoutAmount +
                thirdLevelFirstPackagePayoutAmount +
                fourthLevelFirstPackagePayoutAmount,
        );
        expect(user1Data.balance).toEqual(
            balanceAfterPayingForPackage1 +
                firstLevelFirstPackagePayoutAmount +
                secondLevelFirstPackagePayoutAmount +
                thirdLevelFirstPackagePayoutAmount +
                fourthLevelFirstPackagePayoutAmount +
                fifthLevelFirstPackagePayoutAmount,
        );

        const user7UplinesPackageLevelsMapping: Dictionary<bigint, bigint> = Dictionary.empty();

        user7UplinesPackageLevelsMapping.set(1n, user6Data.packageLevel);
        user7UplinesPackageLevelsMapping.set(2n, user5Data.packageLevel);
        user7UplinesPackageLevelsMapping.set(3n, user4Data.packageLevel);
        user7UplinesPackageLevelsMapping.set(4n, user3Data.packageLevel);
        user7UplinesPackageLevelsMapping.set(5n, user2Data.packageLevel);
        user7UplinesPackageLevelsMapping.set(6n, user1Data.packageLevel);

        companyWalletBalanceBefore = await companyWallet.getBalance();
        userWalletBalanceBefore = await user7Wallet.getBalance();
        mainContractBalanceBefore = await hypersonicMainContract.getBalance();
        userContractBalanceBefore = await users[6].getBalance();

        let user7DataForDistribution = await users[6].getUniLevelUserData();

        await upgradeUserUnilevel(
            user7Wallet,
            user7DataForDistribution,
            user7UplinesPackageLevelsMapping,
            1,
            contractKey,
            hypersonicMainContract,
        );

        companyWalletBalanceAfter = await companyWallet.getBalance();
        userWalletBalanceAfter = await user7Wallet.getBalance();
        mainContractBalanceAfter = await hypersonicMainContract.getBalance();
        userContractBalanceAfter = await users[6].getBalance();

        if (showLogs) {
            console.log('User 7 Upgrade Fees:');
            console.table([
                {
                    Description: 'User 7 Wallet Balance Fees',
                    'Amount (TON)': (
                        Number(userWalletBalanceBefore) / Number(toNano(1)) -
                        Number(userWalletBalanceAfter) / Number(toNano(1))
                    ).toFixed(5),
                },
                {
                    Description: 'Main Contract Balance Fees',
                    'Amount (TON)': (
                        Number(mainContractBalanceBefore) / Number(toNano(1)) -
                        Number(mainContractBalanceAfter) / Number(toNano(1))
                    ).toFixed(5),
                },
                {
                    Description: 'User 7 Contract Balance Fees',
                    'Amount (TON)': (
                        Number(userContractBalanceBefore) / Number(toNano(1)) -
                        Number(userContractBalanceAfter) / Number(toNano(1))
                    ).toFixed(5),
                },
                {
                    Description: 'Company Wallet Profit',
                    'Amount (TON)': (
                        Number(companyWalletBalanceAfter) / Number(toNano(1)) -
                        Number(companyWalletBalanceBefore) / Number(toNano(1))
                    ).toFixed(5),
                },
            ]);
        }

        expect(Number(fromNano(userWalletBalanceAfter))).toBeCloseTo(Number(fromNano(userWalletBalanceBefore)), 0);

        expect(Number(fromNano(companyWalletBalanceAfter))).toBeCloseTo(
            Number(
                fromNano(
                    Number(companyWalletBalanceBefore) + Number(getPayoutAmount(Number(toNano('3')), 20)), // 10% goes to user 6, 20% goes to user 5, 20% goes to user 4, 10% goes to user 3, 10% goes to user 2, 10% goes to user 1
                ),
            ),
            1,
        );

        let user7Data = await users[6].getUniLevelUserData();

        expect(user7Data.packageLevel).toEqual(1n);
        expect(user7Data.balance).toEqual(balanceAfterPayingForPackage1);

        user1Data = await users[0].getUniLevelUserData();
        user2Data = await users[1].getUniLevelUserData();
        user3Data = await users[2].getUniLevelUserData();
        user4Data = await users[3].getUniLevelUserData();
        user5Data = await users[4].getUniLevelUserData();
        user6Data = await users[5].getUniLevelUserData();

        expect(user6Data.balance).toEqual(balanceAfterPayingForPackage1 + firstLevelFirstPackagePayoutAmount);
        expect(user5Data.balance).toEqual(
            balanceAfterPayingForPackage1 + firstLevelFirstPackagePayoutAmount + secondLevelFirstPackagePayoutAmount,
        );
        expect(user4Data.balance).toEqual(
            balanceAfterPayingForPackage1 +
                firstLevelFirstPackagePayoutAmount +
                secondLevelFirstPackagePayoutAmount +
                thirdLevelFirstPackagePayoutAmount,
        );
        expect(user3Data.balance).toEqual(
            balanceAfterPayingForPackage1 +
                firstLevelFirstPackagePayoutAmount +
                secondLevelFirstPackagePayoutAmount +
                thirdLevelFirstPackagePayoutAmount +
                fourthLevelFirstPackagePayoutAmount,
        );
        expect(user2Data.balance).toEqual(
            balanceAfterPayingForPackage1 +
                firstLevelFirstPackagePayoutAmount +
                secondLevelFirstPackagePayoutAmount +
                thirdLevelFirstPackagePayoutAmount +
                fourthLevelFirstPackagePayoutAmount +
                fifthLevelFirstPackagePayoutAmount,
        );
        expect(user1Data.balance).toEqual(
            balanceAfterPayingForPackage1 +
                firstLevelFirstPackagePayoutAmount +
                secondLevelFirstPackagePayoutAmount +
                thirdLevelFirstPackagePayoutAmount +
                fourthLevelFirstPackagePayoutAmount +
                fifthLevelFirstPackagePayoutAmount +
                sixthLevelFirstPackagePayoutAmount,
        );

        const user8UplinesPackageLevelsMapping: Dictionary<bigint, bigint> = Dictionary.empty();

        user8UplinesPackageLevelsMapping.set(1n, user7Data.packageLevel);
        user8UplinesPackageLevelsMapping.set(2n, user6Data.packageLevel);
        user8UplinesPackageLevelsMapping.set(3n, user5Data.packageLevel);
        user8UplinesPackageLevelsMapping.set(4n, user4Data.packageLevel);
        user8UplinesPackageLevelsMapping.set(5n, user3Data.packageLevel);
        user8UplinesPackageLevelsMapping.set(6n, user2Data.packageLevel);
        user8UplinesPackageLevelsMapping.set(7n, user1Data.packageLevel);

        companyWalletBalanceBefore = await companyWallet.getBalance();
        userWalletBalanceBefore = await user8Wallet.getBalance();
        mainContractBalanceBefore = await hypersonicMainContract.getBalance();
        userContractBalanceBefore = await users[7].getBalance();

        let user8DataForDistribution = await users[7].getUniLevelUserData();

        await upgradeUserUnilevel(
            user8Wallet,
            user8DataForDistribution,
            user8UplinesPackageLevelsMapping,
            1,
            contractKey,
            hypersonicMainContract,
        );

        companyWalletBalanceAfter = await companyWallet.getBalance();
        userWalletBalanceAfter = await user8Wallet.getBalance();
        mainContractBalanceAfter = await hypersonicMainContract.getBalance();
        userContractBalanceAfter = await users[7].getBalance();

        if (showLogs) {
            console.log('User 8 Upgrade Fees:');
            console.table([
                {
                    Description: 'User 8 Wallet Balance Fees',
                    'Amount (TON)': (
                        Number(userWalletBalanceBefore) / Number(toNano(1)) -
                        Number(userWalletBalanceAfter) / Number(toNano(1))
                    ).toFixed(5),
                },
                {
                    Description: 'Main Contract Balance Fees',
                    'Amount (TON)': (
                        Number(mainContractBalanceBefore) / Number(toNano(1)) -
                        Number(mainContractBalanceAfter) / Number(toNano(1))
                    ).toFixed(5),
                },
                {
                    Description: 'User 8 Contract Balance Fees',
                    'Amount (TON)': (
                        Number(userContractBalanceBefore) / Number(toNano(1)) -
                        Number(userContractBalanceAfter) / Number(toNano(1))
                    ).toFixed(5),
                },
                {
                    Description: 'Company Wallet Profit',
                    'Amount (TON)': (
                        Number(companyWalletBalanceAfter) / Number(toNano(1)) -
                        Number(companyWalletBalanceBefore) / Number(toNano(1))
                    ).toFixed(5),
                },
            ]);
        }

        expect(Number(fromNano(userWalletBalanceAfter))).toBeCloseTo(Number(fromNano(userWalletBalanceBefore)), 0);

        expect(Number(fromNano(companyWalletBalanceAfter))).toBeCloseTo(
            Number(
                fromNano(
                    Number(companyWalletBalanceBefore) + Number(getPayoutAmount(Number(toNano('3')), 10)), // 10% goes to user 7, 20% goes to user 6, 20% goes to user 5, 10% goes to user 4, 10% goes to user 3, 10% goes to user 2, 10% goes to user 1
                ),
            ),
            1,
        );

        let user8Data = await users[7].getUniLevelUserData();

        expect(user8Data.packageLevel).toEqual(1n);
        expect(user8Data.balance).toEqual(balanceAfterPayingForPackage1);

        user1Data = await users[0].getUniLevelUserData();
        user2Data = await users[1].getUniLevelUserData();
        user3Data = await users[2].getUniLevelUserData();
        user4Data = await users[3].getUniLevelUserData();
        user5Data = await users[4].getUniLevelUserData();
        user6Data = await users[5].getUniLevelUserData();
        user7Data = await users[6].getUniLevelUserData();

        expect(user7Data.balance).toEqual(balanceAfterPayingForPackage1 + firstLevelFirstPackagePayoutAmount);
        expect(user6Data.balance).toEqual(
            balanceAfterPayingForPackage1 + firstLevelFirstPackagePayoutAmount + secondLevelFirstPackagePayoutAmount,
        );
        expect(user5Data.balance).toEqual(
            balanceAfterPayingForPackage1 +
                firstLevelFirstPackagePayoutAmount +
                secondLevelFirstPackagePayoutAmount +
                thirdLevelFirstPackagePayoutAmount,
        );
        expect(user4Data.balance).toEqual(
            balanceAfterPayingForPackage1 +
                firstLevelFirstPackagePayoutAmount +
                secondLevelFirstPackagePayoutAmount +
                thirdLevelFirstPackagePayoutAmount +
                fourthLevelFirstPackagePayoutAmount,
        );
        expect(user3Data.balance).toEqual(
            balanceAfterPayingForPackage1 +
                firstLevelFirstPackagePayoutAmount +
                secondLevelFirstPackagePayoutAmount +
                thirdLevelFirstPackagePayoutAmount +
                fourthLevelFirstPackagePayoutAmount +
                fifthLevelFirstPackagePayoutAmount,
        );
        expect(user2Data.balance).toEqual(
            balanceAfterPayingForPackage1 +
                firstLevelFirstPackagePayoutAmount +
                secondLevelFirstPackagePayoutAmount +
                thirdLevelFirstPackagePayoutAmount +
                fourthLevelFirstPackagePayoutAmount +
                fifthLevelFirstPackagePayoutAmount +
                sixthLevelFirstPackagePayoutAmount,
        );
        expect(user1Data.balance).toEqual(
            balanceAfterPayingForPackage1 +
                firstLevelFirstPackagePayoutAmount +
                secondLevelFirstPackagePayoutAmount +
                thirdLevelFirstPackagePayoutAmount +
                fourthLevelFirstPackagePayoutAmount +
                fifthLevelFirstPackagePayoutAmount +
                sixthLevelFirstPackagePayoutAmount +
                seventhLevelFirstPackagePayoutAmount,
        );

        const user9UplinesPackageLevelsMapping1: Dictionary<bigint, bigint> = Dictionary.empty();

        user9UplinesPackageLevelsMapping1.set(1n, user7Data.packageLevel);
        user9UplinesPackageLevelsMapping1.set(2n, user6Data.packageLevel);
        user9UplinesPackageLevelsMapping1.set(3n, user5Data.packageLevel);
        user9UplinesPackageLevelsMapping1.set(4n, user4Data.packageLevel);
        user9UplinesPackageLevelsMapping1.set(5n, user3Data.packageLevel);
        user9UplinesPackageLevelsMapping1.set(6n, user2Data.packageLevel);
        user9UplinesPackageLevelsMapping1.set(7n, user1Data.packageLevel);

        companyWalletBalanceBefore = await companyWallet.getBalance();
        userWalletBalanceBefore = await user9Wallet.getBalance();
        mainContractBalanceBefore = await hypersonicMainContract.getBalance();
        userContractBalanceBefore = await users[8].getBalance();

        let user9DataForDistribution = await users[8].getUniLevelUserData();

        await upgradeUserUnilevel(
            user9Wallet,
            user9DataForDistribution,
            user9UplinesPackageLevelsMapping1,
            3,
            contractKey,
            hypersonicMainContract,
        );

        companyWalletBalanceAfter = await companyWallet.getBalance();
        userWalletBalanceAfter = await user9Wallet.getBalance();
        mainContractBalanceAfter = await hypersonicMainContract.getBalance();
        userContractBalanceAfter = await users[8].getBalance();

        if (showLogs) {
            console.log('User 9 Upgrade Fees:');
            console.table([
                {
                    Description: 'User 9 Wallet Balance Fees',
                    'Amount (TON)': (
                        Number(userWalletBalanceBefore) / Number(toNano(1)) -
                        Number(userWalletBalanceAfter) / Number(toNano(1))
                    ).toFixed(5),
                },
                {
                    Description: 'Main Contract Balance Fees',
                    'Amount (TON)': (
                        Number(mainContractBalanceBefore) / Number(toNano(1)) -
                        Number(mainContractBalanceAfter) / Number(toNano(1))
                    ).toFixed(5),
                },
                {
                    Description: 'User 9 Contract Balance Fees',
                    'Amount (TON)': (
                        Number(userContractBalanceBefore) / Number(toNano(1)) -
                        Number(userContractBalanceAfter) / Number(toNano(1))
                    ).toFixed(5),
                },
                {
                    Description: 'Company Wallet Profit',
                    'Amount (TON)': (
                        Number(companyWalletBalanceAfter) / Number(toNano(1)) -
                        Number(companyWalletBalanceBefore) / Number(toNano(1))
                    ).toFixed(5),
                },
            ]);
        }

        expect(Number(fromNano(userWalletBalanceAfter))).toBeCloseTo(Number(fromNano(userWalletBalanceBefore)), 0);

        expect(Number(fromNano(companyWalletBalanceAfter))).toBeCloseTo(
            Number(
                fromNano(
                    Number(companyWalletBalanceBefore) +
                        Number(getPayoutAmount(Number(toNano('3')), 10)) + // 1st Level: 10% goes to user 7, 20% goes to user 6, 20% goes to user 5, 10% goes to user 4, 10% goes to user 3, 10% goes to user 2, 10% goes to user 1
                        Number(getPayoutAmount(Number(toNano('15')), 100)) + // 2nd Level: No one qualifies, all the money goes to the company
                        Number(getPayoutAmount(Number(toNano('60')), 100)), // 3rd Level: No one qualifies, all the money goes to the company
                ),
            ),
            1,
        );

        user1Data = await users[0].getUniLevelUserData();
        user2Data = await users[1].getUniLevelUserData();
        user3Data = await users[2].getUniLevelUserData();
        user4Data = await users[3].getUniLevelUserData();
        user5Data = await users[4].getUniLevelUserData();
        user6Data = await users[5].getUniLevelUserData();
        user7Data = await users[6].getUniLevelUserData();

        expect(user7Data.balance).toEqual(
            balanceAfterPayingForPackage1 + firstLevelFirstPackagePayoutAmount + firstLevelFirstPackagePayoutAmount,
        );
        expect(user6Data.balance).toEqual(
            balanceAfterPayingForPackage1 +
                firstLevelFirstPackagePayoutAmount +
                secondLevelFirstPackagePayoutAmount +
                secondLevelFirstPackagePayoutAmount,
        );
        expect(user5Data.balance).toEqual(
            balanceAfterPayingForPackage1 +
                firstLevelFirstPackagePayoutAmount +
                secondLevelFirstPackagePayoutAmount +
                thirdLevelFirstPackagePayoutAmount +
                thirdLevelFirstPackagePayoutAmount,
        );
        expect(user4Data.balance).toEqual(
            balanceAfterPayingForPackage1 +
                firstLevelFirstPackagePayoutAmount +
                secondLevelFirstPackagePayoutAmount +
                thirdLevelFirstPackagePayoutAmount +
                fourthLevelFirstPackagePayoutAmount +
                fourthLevelFirstPackagePayoutAmount,
        );
        expect(user3Data.balance).toEqual(
            balanceAfterPayingForPackage1 +
                firstLevelFirstPackagePayoutAmount +
                secondLevelFirstPackagePayoutAmount +
                thirdLevelFirstPackagePayoutAmount +
                fourthLevelFirstPackagePayoutAmount +
                fifthLevelFirstPackagePayoutAmount +
                fifthLevelFirstPackagePayoutAmount,
        );
        expect(user2Data.balance).toEqual(
            balanceAfterPayingForPackage1 +
                firstLevelFirstPackagePayoutAmount +
                secondLevelFirstPackagePayoutAmount +
                thirdLevelFirstPackagePayoutAmount +
                fourthLevelFirstPackagePayoutAmount +
                fifthLevelFirstPackagePayoutAmount +
                sixthLevelFirstPackagePayoutAmount +
                sixthLevelFirstPackagePayoutAmount,
        );
        expect(user1Data.balance).toEqual(
            balanceAfterPayingForPackage1 +
                firstLevelFirstPackagePayoutAmount +
                secondLevelFirstPackagePayoutAmount +
                thirdLevelFirstPackagePayoutAmount +
                fourthLevelFirstPackagePayoutAmount +
                fifthLevelFirstPackagePayoutAmount +
                sixthLevelFirstPackagePayoutAmount +
                seventhLevelFirstPackagePayoutAmount +
                seventhLevelFirstPackagePayoutAmount,
        );

        let user9Data = await users[8].getUniLevelUserData();

        expect(user9Data.packageLevel).toEqual(3n);
        expect(user9Data.balance).toEqual(toNano('100') - toNano('3') - toNano('15') - toNano('60'));
    };

    const checkWithdrawUserContractTonBalance = async (showLogs: boolean = false) => {
        const userWallets = [
            user1Wallet,
            user2Wallet,
            user3Wallet,
            user4Wallet,
            user5Wallet,
            user6Wallet,
            user7Wallet,
            user8Wallet,
            user9Wallet,
        ];

        const users = await Promise.all(
            userWallets.map(async (wallet) => {
                return blockchain.openContract(await HypersonicUserContract.fromInit(wallet.getSender().address));
            }),
        );

        const withdrawalAmount1 = toNano('0.05');

        let user1ContractBalanceBefore = await users[0].getBalance();
        let user1WalletBalanceBefore = await user1Wallet.getBalance();

        const user1WithdrawResult1 = await users[0].send(
            user1Wallet.getSender(),
            {
                value: toNano('0.05'),
            },
            {
                $$type: 'WithdrawUserContractTonBalance',
                amount: withdrawalAmount1,
            },
        );

        let user1ContractBalanceAfter = await users[0].getBalance();
        let user1WalletBalanceAfter = await user1Wallet.getBalance();

        if (showLogs) {
            console.log('-------------------------------------------------');
            console.log('User Extra TON from Contract Withdraw Fees:');
            console.table([
                {
                    Description: 'Amount to Withdraw',
                    'Amount (TON)': (Number(withdrawalAmount1) / Number(toNano(1))).toFixed(5),
                },
                {
                    Description: 'User Contract Balance Before Withdrawing',
                    'Amount (TON)': (Number(user1ContractBalanceBefore) / Number(toNano(1))).toFixed(5),
                },
                {
                    Description: 'User Contract Balance After Withdrawing',
                    'Amount (TON)': (Number(user1ContractBalanceAfter) / Number(toNano(1))).toFixed(5),
                },
            ]);
        }

        expect(Number(fromNano(user1ContractBalanceAfter))).toBeCloseTo(
            Number(fromNano(user1ContractBalanceBefore - withdrawalAmount1)),
            1,
        );
        expect(Number(fromNano(user1WalletBalanceAfter))).toBeCloseTo(
            Number(fromNano(user1WalletBalanceBefore + withdrawalAmount1)),
            1,
        );

        const withdrawalAmount2 = toNano('0.3');

        user1ContractBalanceBefore = await users[0].getBalance();
        user1WalletBalanceBefore = await user1Wallet.getBalance();

        const user1WithdrawResult2 = await users[0].send(
            user1Wallet.getSender(),
            {
                value: toNano('0.05'),
            },
            {
                $$type: 'WithdrawUserContractTonBalance',
                amount: withdrawalAmount2,
            },
        );

        user1ContractBalanceAfter = await users[0].getBalance();
        user1WalletBalanceAfter = await user1Wallet.getBalance();

        expect(user1WithdrawResult2.transactions).toHaveTransaction({
            success: false,
        });

        expect(Number(fromNano(user1ContractBalanceAfter))).toBeCloseTo(
            Number(fromNano(user1ContractBalanceBefore)),
            1,
        );
        expect(Number(fromNano(user1WalletBalanceAfter))).toBeCloseTo(Number(fromNano(user1WalletBalanceBefore)), 1);

        user1ContractBalanceBefore = await users[0].getBalance();
        user1WalletBalanceBefore = await user1Wallet.getBalance();

        const user2WithdrawResult = await users[0].send(
            // User 2 tries to withdraw TON from user 1's contract should fail
            user2Wallet.getSender(),
            {
                value: toNano('0.05'),
            },
            {
                $$type: 'WithdrawUserContractTonBalance',
                amount: toNano('0.1'),
            },
        );

        user1ContractBalanceAfter = await users[0].getBalance();
        user1WalletBalanceAfter = await user1Wallet.getBalance();

        expect(user2WithdrawResult.transactions).toHaveTransaction({
            success: false,
        });

        expect(Number(fromNano(user1ContractBalanceAfter))).toBeCloseTo(
            Number(fromNano(user1ContractBalanceBefore)),
            1,
        );
        expect(Number(fromNano(user1WalletBalanceAfter))).toBeCloseTo(Number(fromNano(user1WalletBalanceBefore)), 1);
    };

    const checkSubscribeToMatrix = async (showLogs: boolean = false) => {
        const userWallets = [
            companyWallet,
            user1Wallet,
            user2Wallet,
            user3Wallet,
            user4Wallet,
            user5Wallet,
            user6Wallet,
            user7Wallet,
            user8Wallet,
            user9Wallet,
        ];

        const users = await Promise.all(
            userWallets.map(async (wallet) => {
                return blockchain.openContract(await HypersonicUserContract.fromInit(wallet.getSender().address));
            }),
        );

        let userWalletBalanceBefore = await user1Wallet.getBalance();
        let mainContractBalanceBefore = await hypersonicMainContract.getBalance();
        let userContractBalanceBefore = await users[1].getBalance();

        let userDataBefore = await users[1].getUniLevelUserData();
        let parentMatrixMember = await convertAddressToMatrixMemberPositionData(
            userDataBefore.upline.mapping.values()[0],
            blockchain,
        );
        let positionInMatrix = await determinePositionInMatrix(parentMatrixMember, blockchain);

        const user1SubscribeToMatrixResult = await hypersonicMainContract.send(
            user1Wallet.getSender(),
            {
                value: toNano('0.25'),
            },
            {
                $$type: 'SubscribeToMatrix',
                walletAddress: user1Wallet.getSender().address,
                subscriptionType: SubscriptionType.YearlyWithin30Days,
                subscriptionPrice: toNano(SubscriptionPrices.YearlyWithin30Days),
                parentUser: positionInMatrix.parent,
                placementUnderParent: positionInMatrix.position,
                contractKey: contractKey,
            },
        );

        let userDataAfter = await users[1].getUniLevelUserData();
        let userWalletBalanceAfter = await user1Wallet.getBalance();
        let mainContractBalanceAfter = await hypersonicMainContract.getBalance();
        let userContractBalanceAfter = await users[1].getBalance();

        expect(userDataBefore.balance).toEqual(userDataAfter.balance + toNano(SubscriptionPrices.YearlyWithin30Days));
        expect(await hypersonicMainContract.getNumberOfSubscribedUsers()).toEqual(1n);

        const companyMatrixData = await users[0].getMatrixUserData();
        let user1MatrixData = await users[1].getMatrixUserData();

        expect(user1MatrixData.parentUser?.toString()).toEqual(companyWallet.getSender().address.toString());
        expect(user1MatrixData.matrixStatuses?.matrixSubscriptionActive).toEqual(true);
        expect(user1MatrixData.matrixSubscriptionType).toEqual(SubscriptionType.YearlyWithin30Days);
        expect(Number(user1MatrixData.matrixRegistrationDate) / 1000).toBeCloseTo(Math.floor(Date.now() / 1000) / 1000);
        expect(Number(user1MatrixData.matrixExpirationDate) / 1000).toBeCloseTo(
            (Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60) / 1000,
        );

        expect(companyMatrixData.leftChildUser?.toString()).toEqual(user1Wallet.getSender().address.toString());
        expect(companyMatrixData.middleChildUser?.toString()).toEqual(undefined);
        expect(companyMatrixData.rightChildUser?.toString()).toEqual(undefined);

        if (showLogs) {
            console.log('-------------------------------------------------');
            console.table([
                {
                    Description: 'User 1 Wallet Balance Fees After Matrix Subscription',
                    'Amount (TON)': (
                        Number(userWalletBalanceBefore) / Number(toNano(1)) -
                        Number(userWalletBalanceAfter) / Number(toNano(1))
                    ).toFixed(5),
                },
                {
                    Description: 'Main Contract Transaction Fees After Matrix Subscription',
                    'Amount (TON)': (
                        Number(mainContractBalanceBefore) / Number(toNano(1)) -
                        Number(mainContractBalanceAfter) / Number(toNano(1))
                    ).toFixed(5),
                },
                {
                    Description: 'User 1 Contract Transaction Fees After Matrix Subscription',
                    'Amount (TON)': (
                        Number(userContractBalanceBefore) / Number(toNano(1)) -
                        Number(userContractBalanceAfter) / Number(toNano(1))
                    ).toFixed(5),
                },
            ]);
        }

        userWalletBalanceBefore = await user2Wallet.getBalance();
        mainContractBalanceBefore = await hypersonicMainContract.getBalance();
        userContractBalanceBefore = await users[2].getBalance();

        userDataBefore = await users[2].getUniLevelUserData();
        parentMatrixMember = await convertAddressToMatrixMemberPositionData(
            userDataBefore.upline.mapping.values()[0],
            blockchain,
        );
        positionInMatrix = await determinePositionInMatrix(parentMatrixMember, blockchain);

        const user2SubscribeToMatrixResult = await hypersonicMainContract.send(
            user2Wallet.getSender(),
            {
                value: toNano('0.25'),
            },
            {
                $$type: 'SubscribeToMatrix',
                walletAddress: user2Wallet.getSender().address,
                subscriptionType: SubscriptionType.YearlyAfter30Days,
                subscriptionPrice: toNano(SubscriptionPrices.YearlyAfter30Days),
                parentUser: positionInMatrix.parent,
                placementUnderParent: positionInMatrix.position,
                contractKey: contractKey,
            },
        );

        userDataAfter = await users[2].getUniLevelUserData();
        userWalletBalanceAfter = await user2Wallet.getBalance();
        mainContractBalanceAfter = await hypersonicMainContract.getBalance();
        userContractBalanceAfter = await users[2].getBalance();

        expect(userDataBefore.balance).toEqual(userDataAfter.balance + toNano(SubscriptionPrices.YearlyAfter30Days));
        expect(await hypersonicMainContract.getNumberOfSubscribedUsers()).toEqual(2n);

        user1MatrixData = await users[1].getMatrixUserData();
        let user2MatrixData = await users[2].getMatrixUserData();

        expect(user2MatrixData.parentUser?.toString()).toEqual(user1Wallet.getSender().address.toString());
        expect(user2MatrixData.matrixStatuses?.matrixSubscriptionActive).toEqual(true);
        expect(user2MatrixData.matrixSubscriptionType).toEqual(SubscriptionType.YearlyAfter30Days);
        expect(Number(user2MatrixData.matrixRegistrationDate) / 1000).toBeCloseTo(Math.floor(Date.now() / 1000) / 1000);
        expect(Number(user2MatrixData.matrixExpirationDate) / 1000).toBeCloseTo(
            (Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60) / 1000,
        );

        expect(user1MatrixData.leftChildUser?.toString()).toEqual(user2Wallet.getSender().address.toString());
        expect(user1MatrixData.middleChildUser?.toString()).toEqual(undefined);
        expect(user1MatrixData.rightChildUser?.toString()).toEqual(undefined);

        if (showLogs) {
            console.table([
                {
                    Description: 'User 2 Wallet Balance Fees After Matrix Subscription',
                    'Amount (TON)': (
                        Number(userWalletBalanceBefore) / Number(toNano(1)) -
                        Number(userWalletBalanceAfter) / Number(toNano(1))
                    ).toFixed(5),
                },
                {
                    Description: 'Main Contract Transaction Fees After Matrix Subscription',
                    'Amount (TON)': (
                        Number(mainContractBalanceBefore) / Number(toNano(1)) -
                        Number(mainContractBalanceAfter) / Number(toNano(1))
                    ).toFixed(5),
                },
                {
                    Description: 'User 2 Contract Transaction Fees After Matrix Subscription',
                    'Amount (TON)': (
                        Number(userContractBalanceBefore) / Number(toNano(1)) -
                        Number(userContractBalanceAfter) / Number(toNano(1))
                    ).toFixed(5),
                },
            ]);
        }

        const user1Data = await user1.getUniLevelUserData();
        const user1Upline = user1Data.upline.mapping;

        user10Wallet = await blockchain.treasury('user10');

        const user10UplineMapping: Dictionary<bigint, Address> = Dictionary.empty();
        user10UplineMapping.set(1n, user1Wallet.getSender().address);
        user10UplineMapping
            .keys()
            .slice(0, 6)
            .forEach((key, index) => {
                user10UplineMapping.set(BigInt(index + 2), user1Upline.get(key)!);
            });

        const user10RegistrationData = {
            walletAddress: user10Wallet.getSender().address,
            username: 'testUser10',
            upline: {
                $$type: 'Upline' as 'Upline',
                mapping: user10UplineMapping,
                count: BigInt(user10UplineMapping.values().length),
            },
            contractKey: contractKey,
        };

        const user10WalletBalanceBefore = await user10Wallet.getBalance();
        const mainContractBalanceBeforeUser10Registration = await hypersonicMainContract.getBalance();

        const user10RegisterResult = await hypersonicMainContract.send(
            user10Wallet.getSender(),
            {
                value: toNano('0.25'),
            },
            {
                $$type: 'Register',
                ...user10RegistrationData,
            },
        );

        const user10WalletBalanceAfter = await user10Wallet.getBalance();
        const mainContractBalanceAfterUser10Registration = await hypersonicMainContract.getBalance();

        if (showLogs) {
            console.table([
                {
                    Description: 'User 10 Transaction Fees For Registration',
                    'Amount (TON)': (
                        Number(user10WalletBalanceBefore) / Number(toNano(1)) -
                        Number(user10WalletBalanceAfter) / Number(toNano(1))
                    ).toFixed(5),
                },
                {
                    Description: 'Main Contract Transaction Fees After User 10 Registration',
                    'Amount (TON)': (
                        Number(mainContractBalanceBeforeUser10Registration) / Number(toNano(1)) -
                        Number(mainContractBalanceAfterUser10Registration) / Number(toNano(1))
                    ).toFixed(5),
                },
            ]);
        }

        let updatedUser1Data = await user1.getUniLevelUserData();

        expect(updatedUser1Data.invited.mapping.values()[1].toString()).toEqual(
            user10Wallet.getSender().address.toString(),
        );
        expect(updatedUser1Data.invited.count).toEqual(2n);

        const user10Data = await user10.getUniLevelUserData();
        const user10Upline = user10Data.upline.mapping;

        expect(user10Data.username).toEqual(user10RegistrationData.username);
        expect(user10Data.walletAddress.toString()).toEqual(user10Wallet.getSender().address.toString());
        expect(Number(user10Data.upline.count)).toEqual(user10UplineMapping.values().length);

        const numberOfUsersAfterUser10Registration = await hypersonicMainContract.getNumberOfUsers();
        expect(numberOfUsersAfterUser10Registration.toString()).toEqual('11');

        expect(user10Upline.get(1n)?.toString()).toEqual(user1Wallet.getSender().address.toString());
        expect(user10Upline.get(2n)?.toString()).toEqual(user1RegistrationData.upline.mapping.get(1n)?.toString());
        expect(user10Upline.get(3n)?.toString()).toEqual(undefined);
        expect(user10Upline.get(4n)?.toString()).toEqual(undefined);
        expect(user10Upline.get(5n)?.toString()).toEqual(undefined);
        expect(user10Upline.get(6n)?.toString()).toEqual(undefined);
        expect(user10Upline.get(7n)?.toString()).toEqual(undefined);
        expect(user10Upline.get(8n)?.toString()).toEqual(undefined);

        let depositAmount = 100;

        const user10DepositResult = await hypersonicMainContract.send(
            user10Wallet.getSender(),
            { value: toNano(depositAmount + 0.25) },
            {
                $$type: 'Deposit',
                walletAddress: user10Wallet.getSender().address,
                amount: toNano(depositAmount),
                contractKey: contractKey,
            },
        );

        expect(user10DepositResult.transactions).toHaveTransaction({
            success: true,
        });

        userDataBefore = await user10.getUniLevelUserData();
        parentMatrixMember = await convertAddressToMatrixMemberPositionData(
            userDataBefore.upline.mapping.values()[0],
            blockchain,
        );
        positionInMatrix = await determinePositionInMatrix(parentMatrixMember, blockchain);

        const user10SubscribeToMatrixResult1 = await hypersonicMainContract.send(
            user10Wallet.getSender(),
            {
                value: toNano('0.25'),
            },
            {
                $$type: 'SubscribeToMatrix',
                walletAddress: user10Wallet.getSender().address,
                subscriptionType: SubscriptionType.MonthlyAfter30Days,
                subscriptionPrice: toNano(SubscriptionPrices.MonthlyAfter30Days),
                parentUser: positionInMatrix.parent,
                placementUnderParent: positionInMatrix.position,
                contractKey: contractKey,
            },
        );

        expect(user10SubscribeToMatrixResult1.transactions).toHaveTransaction({
            success: false,
        }); // Need to upgrade package first before being able to subscribe

        const user10UplinesPackageLevelsMapping: Dictionary<bigint, bigint> = Dictionary.empty();

        user10UplinesPackageLevelsMapping.set(1n, user1Data.packageLevel);

        userDataBefore = await user10.getUniLevelUserData();

        let user10DataForDistribution = await user10.getUniLevelUserData();

        await upgradeUserUnilevel(
            user10Wallet,
            user10DataForDistribution,
            user10UplinesPackageLevelsMapping,
            1,
            contractKey,
            hypersonicMainContract,
        );

        userWalletBalanceBefore = await user10Wallet.getBalance();
        mainContractBalanceBefore = await hypersonicMainContract.getBalance();
        userContractBalanceBefore = await user10.getBalance();

        userDataBefore = await user10.getUniLevelUserData();
        parentMatrixMember = await convertAddressToMatrixMemberPositionData(
            userDataBefore.upline.mapping.values()[0],
            blockchain,
        );
        positionInMatrix = await determinePositionInMatrix(parentMatrixMember, blockchain);

        const user10SubscribeToMatrixResult2 = await hypersonicMainContract.send(
            user10Wallet.getSender(),
            {
                value: toNano('0.25'),
            },
            {
                $$type: 'SubscribeToMatrix',
                walletAddress: user10Wallet.getSender().address,
                subscriptionType: SubscriptionType.MonthlyAfter30Days,
                subscriptionPrice: toNano(SubscriptionPrices.MonthlyAfter30Days),
                parentUser: positionInMatrix.parent,
                placementUnderParent: positionInMatrix.position,
                contractKey: contractKey,
            },
        );

        userDataAfter = await user10.getUniLevelUserData();
        userWalletBalanceAfter = await user10Wallet.getBalance();
        mainContractBalanceAfter = await hypersonicMainContract.getBalance();
        userContractBalanceAfter = await user10.getBalance();

        expect(userDataBefore.balance).toEqual(userDataAfter.balance + toNano(SubscriptionPrices.MonthlyAfter30Days));
        expect(await hypersonicMainContract.getNumberOfSubscribedUsers()).toEqual(3n);

        user1MatrixData = await users[1].getMatrixUserData();
        let user10MatrixData = await user10.getMatrixUserData();

        expect(user10MatrixData.parentUser?.toString()).toEqual(user1Wallet.getSender().address.toString());
        expect(user10MatrixData.matrixStatuses?.matrixSubscriptionActive).toEqual(true);
        expect(user10MatrixData.matrixSubscriptionType).toEqual(SubscriptionType.MonthlyAfter30Days);
        expect(Number(user10MatrixData.matrixRegistrationDate) / 1000).toBeCloseTo(
            Math.floor(Date.now() / 1000) / 1000,
        );
        expect(Number(user10MatrixData.matrixExpirationDate) / 1000).toBeCloseTo(
            (Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60) / 1000,
        );

        expect(user1MatrixData.leftChildUser?.toString()).toEqual(user2Wallet.getSender().address.toString());
        expect(user1MatrixData.middleChildUser?.toString()).toEqual(user10Wallet.getSender().address.toString());
        expect(user1MatrixData.rightChildUser?.toString()).toEqual(undefined);

        if (showLogs) {
            console.table([
                {
                    Description: 'User 10 Wallet Balance Fees After Matrix Subscription',
                    'Amount (TON)': (
                        Number(userWalletBalanceBefore) / Number(toNano(1)) -
                        Number(userWalletBalanceAfter) / Number(toNano(1))
                    ).toFixed(5),
                },
                {
                    Description: 'Main Contract Transaction Fees After Matrix Subscription',
                    'Amount (TON)': (
                        Number(mainContractBalanceBefore) / Number(toNano(1)) -
                        Number(mainContractBalanceAfter) / Number(toNano(1))
                    ).toFixed(5),
                },
                {
                    Description: 'User 10 Contract Transaction Fees After Matrix Subscription',
                    'Amount (TON)': (
                        Number(userContractBalanceBefore) / Number(toNano(1)) -
                        Number(userContractBalanceAfter) / Number(toNano(1))
                    ).toFixed(5),
                },
            ]);
        }

        let user11Wallet = await blockchain.treasury('user11');

        const user11UplineMapping: Dictionary<bigint, Address> = Dictionary.empty();
        user11UplineMapping.set(1n, user1Wallet.getSender().address);
        user11UplineMapping
            .keys()
            .slice(0, 6)
            .forEach((key, index) => {
                user11UplineMapping.set(BigInt(index + 2), user1Upline.get(key)!);
            });

        const user11RegistrationData = {
            walletAddress: user11Wallet.getSender().address,
            username: 'testUser11',
            upline: {
                $$type: 'Upline' as 'Upline',
                mapping: user11UplineMapping,
                count: BigInt(user11UplineMapping.values().length),
            },
            contractKey: contractKey,
        };

        const user11WalletBalanceBefore = await user11Wallet.getBalance();
        const mainContractBalanceBeforeUser11Registration = await hypersonicMainContract.getBalance();

        const user11RegisterResult = await hypersonicMainContract.send(
            user11Wallet.getSender(),
            {
                value: toNano('0.25'),
            },
            {
                $$type: 'Register',
                ...user11RegistrationData,
            },
        );

        const user11WalletBalanceAfter = await user11Wallet.getBalance();
        const mainContractBalanceAfterUser11Registration = await hypersonicMainContract.getBalance();

        if (showLogs) {
            console.table([
                {
                    Description: 'User 11 Transaction Fees For Registration',
                    'Amount (TON)': (
                        Number(user11WalletBalanceBefore) / Number(toNano(1)) -
                        Number(user11WalletBalanceAfter) / Number(toNano(1))
                    ).toFixed(5),
                },
                {
                    Description: 'Main Contract Transaction Fees After User 11 Registration',
                    'Amount (TON)': (
                        Number(mainContractBalanceBeforeUser11Registration) / Number(toNano(1)) -
                        Number(mainContractBalanceAfterUser11Registration) / Number(toNano(1))
                    ).toFixed(5),
                },
            ]);
        }

        let updatedUser1Data2 = await user1.getUniLevelUserData();

        expect(updatedUser1Data2.invited.mapping.values()[2].toString()).toEqual(
            user11Wallet.getSender().address.toString(),
        );
        expect(updatedUser1Data2.invited.count).toEqual(3n);

        const user11Data = await user11.getUniLevelUserData();
        const user11Upline = user11Data.upline.mapping;

        expect(user11Data.username).toEqual(user11RegistrationData.username);
        expect(user11Data.walletAddress.toString()).toEqual(user11Wallet.getSender().address.toString());
        expect(Number(user11Data.upline.count)).toEqual(user11UplineMapping.values().length);

        const numberOfUsersAfterUser11Registration = await hypersonicMainContract.getNumberOfUsers();
        expect(numberOfUsersAfterUser11Registration.toString()).toEqual('12');

        expect(user11Upline.get(1n)?.toString()).toEqual(user1Wallet.getSender().address.toString());
        expect(user11Upline.get(2n)?.toString()).toEqual(user1RegistrationData.upline.mapping.get(1n)?.toString());
        expect(user11Upline.get(3n)?.toString()).toEqual(undefined);
        expect(user11Upline.get(4n)?.toString()).toEqual(undefined);
        expect(user11Upline.get(5n)?.toString()).toEqual(undefined);
        expect(user11Upline.get(6n)?.toString()).toEqual(undefined);
        expect(user11Upline.get(7n)?.toString()).toEqual(undefined);
        expect(user11Upline.get(8n)?.toString()).toEqual(undefined);

        const depositAmount2 = 100;

        const user11DepositResult = await hypersonicMainContract.send(
            user11Wallet.getSender(),
            { value: toNano(depositAmount2 + 0.25) },
            {
                $$type: 'Deposit',
                walletAddress: user11Wallet.getSender().address,
                amount: toNano(depositAmount2),
                contractKey: contractKey,
            },
        );

        expect(user11DepositResult.transactions).toHaveTransaction({
            success: true,
        });

        userDataBefore = await user11.getUniLevelUserData();
        parentMatrixMember = await convertAddressToMatrixMemberPositionData(
            userDataBefore.upline.mapping.values()[0],
            blockchain,
        );
        positionInMatrix = await determinePositionInMatrix(parentMatrixMember, blockchain);

        const user11UplinesPackageLevelsMapping: Dictionary<bigint, bigint> = Dictionary.empty();

        user11UplinesPackageLevelsMapping.set(1n, user1Data.packageLevel);

        let user11DataForDistribution = await user11.getUniLevelUserData();

        await upgradeUserUnilevel(
            user11Wallet,
            user11DataForDistribution,
            user11UplinesPackageLevelsMapping,
            1,
            contractKey,
            hypersonicMainContract,
        );

        userWalletBalanceBefore = await user11Wallet.getBalance();
        mainContractBalanceBefore = await hypersonicMainContract.getBalance();
        userContractBalanceBefore = await user11.getBalance();

        userDataBefore = await user11.getUniLevelUserData();
        parentMatrixMember = await convertAddressToMatrixMemberPositionData(
            userDataBefore.upline.mapping.values()[0],
            blockchain,
        );
        positionInMatrix = await determinePositionInMatrix(parentMatrixMember, blockchain);

        const user11SubscribeToMatrixResult = await hypersonicMainContract.send(
            user11Wallet.getSender(),
            {
                value: toNano('0.25'),
            },
            {
                $$type: 'SubscribeToMatrix',
                walletAddress: user11Wallet.getSender().address,
                subscriptionType: SubscriptionType.MonthlyAfter30Days,
                subscriptionPrice: toNano(SubscriptionPrices.MonthlyAfter30Days),
                parentUser: positionInMatrix.parent,
                placementUnderParent: positionInMatrix.position,
                contractKey: contractKey,
            },
        );

        userDataAfter = await user11.getUniLevelUserData();
        userWalletBalanceAfter = await user11Wallet.getBalance();
        mainContractBalanceAfter = await hypersonicMainContract.getBalance();
        userContractBalanceAfter = await user11.getBalance();

        expect(userDataBefore.balance).toEqual(userDataAfter.balance + toNano(SubscriptionPrices.MonthlyAfter30Days));
        expect(await hypersonicMainContract.getNumberOfSubscribedUsers()).toEqual(4n);

        user1MatrixData = await users[1].getMatrixUserData();
        let user11MatrixData = await user11.getMatrixUserData();

        expect(user11MatrixData.parentUser?.toString()).toEqual(user1Wallet.getSender().address.toString());
        expect(user11MatrixData.matrixStatuses?.matrixSubscriptionActive).toEqual(true);
        expect(user11MatrixData.matrixSubscriptionType).toEqual(SubscriptionType.MonthlyAfter30Days);
        expect(Number(user11MatrixData.matrixRegistrationDate) / 1000).toBeCloseTo(
            Math.floor(Date.now() / 1000) / 1000,
        );
        expect(Number(user11MatrixData.matrixExpirationDate) / 1000).toBeCloseTo(
            (Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60) / 1000,
        );

        expect(user1MatrixData.leftChildUser?.toString()).toEqual(user2Wallet.getSender().address.toString());
        expect(user1MatrixData.middleChildUser?.toString()).toEqual(user10Wallet.getSender().address.toString());
        expect(user1MatrixData.rightChildUser?.toString()).toEqual(user11Wallet.getSender().address.toString());

        if (showLogs) {
            console.table([
                {
                    Description: 'User 11 Wallet Balance Fees After Matrix Subscription',
                    'Amount (TON)': (
                        Number(userWalletBalanceBefore) / Number(toNano(1)) -
                        Number(userWalletBalanceAfter) / Number(toNano(1))
                    ).toFixed(5),
                },
                {
                    Description: 'Main Contract Transaction Fees After Matrix Subscription',
                    'Amount (TON)': (
                        Number(mainContractBalanceBefore) / Number(toNano(1)) -
                        Number(mainContractBalanceAfter) / Number(toNano(1))
                    ).toFixed(5),
                },
                {
                    Description: 'User 11 Contract Transaction Fees After Matrix Subscription',
                    'Amount (TON)': (
                        Number(userContractBalanceBefore) / Number(toNano(1)) -
                        Number(userContractBalanceAfter) / Number(toNano(1))
                    ).toFixed(5),
                },
            ]);
        }

        let user12Wallet = await blockchain.treasury('user12');

        const user12UplineMapping: Dictionary<bigint, Address> = Dictionary.empty();
        user12UplineMapping.set(1n, user1Wallet.getSender().address);
        user12UplineMapping
            .keys()
            .slice(0, 6)
            .forEach((key, index) => {
                user12UplineMapping.set(BigInt(index + 2), user1Upline.get(key)!);
            });

        const user12RegistrationData = {
            walletAddress: user12Wallet.getSender().address,
            username: 'testUser12',
            upline: {
                $$type: 'Upline' as 'Upline',
                mapping: user12UplineMapping,
                count: BigInt(user12UplineMapping.values().length),
            },
            contractKey: contractKey,
        };

        const user12WalletBalanceBefore = await user12Wallet.getBalance();
        const mainContractBalanceBeforeUser12Registration = await hypersonicMainContract.getBalance();

        const user12RegisterResult = await hypersonicMainContract.send(
            user12Wallet.getSender(),
            {
                value: toNano('0.25'),
            },
            {
                $$type: 'Register',
                ...user12RegistrationData,
            },
        );

        const user12WalletBalanceAfter = await user12Wallet.getBalance();
        const mainContractBalanceAfterUser12Registration = await hypersonicMainContract.getBalance();

        if (showLogs) {
            console.table([
                {
                    Description: 'User 12 Transaction Fees For Registration',
                    'Amount (TON)': (
                        Number(user12WalletBalanceBefore) / Number(toNano(1)) -
                        Number(user12WalletBalanceAfter) / Number(toNano(1))
                    ).toFixed(5),
                },
                {
                    Description: 'Main Contract Transaction Fees After User 12 Registration',
                    'Amount (TON)': (
                        Number(mainContractBalanceBeforeUser12Registration) / Number(toNano(1)) -
                        Number(mainContractBalanceAfterUser12Registration) / Number(toNano(1))
                    ).toFixed(5),
                },
            ]);
        }

        let updatedUser1Data3 = await user1.getUniLevelUserData();

        expect(updatedUser1Data3.invited.mapping.values()[3].toString()).toEqual(
            user12Wallet.getSender().address.toString(),
        );
        expect(updatedUser1Data3.invited.count).toEqual(4n);

        const user12Data = await user12.getUniLevelUserData();
        const user12Upline = user12Data.upline.mapping;

        expect(user12Data.username).toEqual(user12RegistrationData.username);
        expect(user12Data.walletAddress.toString()).toEqual(user12Wallet.getSender().address.toString());
        expect(Number(user12Data.upline.count)).toEqual(user12UplineMapping.values().length);

        const numberOfUsersAfterUser12Registration = await hypersonicMainContract.getNumberOfUsers();
        expect(numberOfUsersAfterUser12Registration.toString()).toEqual('13');

        expect(user12Upline.get(1n)?.toString()).toEqual(user1Wallet.getSender().address.toString());
        expect(user12Upline.get(2n)?.toString()).toEqual(user1RegistrationData.upline.mapping.get(1n)?.toString());
        expect(user12Upline.get(3n)?.toString()).toEqual(undefined);
        expect(user12Upline.get(4n)?.toString()).toEqual(undefined);
        expect(user12Upline.get(5n)?.toString()).toEqual(undefined);
        expect(user12Upline.get(6n)?.toString()).toEqual(undefined);
        expect(user12Upline.get(7n)?.toString()).toEqual(undefined);
        expect(user12Upline.get(8n)?.toString()).toEqual(undefined);

        const depositAmount3 = 500;

        const user12DepositResult = await hypersonicMainContract.send(
            user12Wallet.getSender(),
            { value: toNano(depositAmount3 + 0.25) },
            {
                $$type: 'Deposit',
                walletAddress: user12Wallet.getSender().address,
                amount: toNano(depositAmount3),
                contractKey: contractKey,
            },
        );

        expect(user12DepositResult.transactions).toHaveTransaction({
            success: true,
        });

        userDataBefore = await user12.getUniLevelUserData();
        parentMatrixMember = await convertAddressToMatrixMemberPositionData(
            userDataBefore.upline.mapping.values()[0],
            blockchain,
        );
        positionInMatrix = await determinePositionInMatrix(parentMatrixMember, blockchain);

        const user12UplinesPackageLevelsMapping: Dictionary<bigint, bigint> = Dictionary.empty();

        user12UplinesPackageLevelsMapping.set(1n, user1Data.packageLevel);

        let user12DataForDistribution = await user12.getUniLevelUserData();

        await upgradeUserUnilevel(
            user12Wallet,
            user12DataForDistribution,
            user12UplinesPackageLevelsMapping,
            1,
            contractKey,
            hypersonicMainContract,
        );

        userWalletBalanceBefore = await user12Wallet.getBalance();
        mainContractBalanceBefore = await hypersonicMainContract.getBalance();
        userContractBalanceBefore = await user12.getBalance();

        userDataBefore = await user12.getUniLevelUserData();
        parentMatrixMember = await convertAddressToMatrixMemberPositionData(
            userDataBefore.upline.mapping.values()[0],
            blockchain,
        );
        positionInMatrix = await determinePositionInMatrix(parentMatrixMember, blockchain);

        const user12SubscribeToMatrixResult = await hypersonicMainContract.send(
            user12Wallet.getSender(),
            {
                value: toNano('0.25'),
            },
            {
                $$type: 'SubscribeToMatrix',
                walletAddress: user12Wallet.getSender().address,
                subscriptionType: SubscriptionType.MonthlyAfter30Days,
                subscriptionPrice: toNano(SubscriptionPrices.MonthlyAfter30Days),
                parentUser: positionInMatrix.parent,
                placementUnderParent: positionInMatrix.position,
                contractKey: contractKey,
            },
        );

        userDataAfter = await user12.getUniLevelUserData();
        userWalletBalanceAfter = await user12Wallet.getBalance();
        mainContractBalanceAfter = await hypersonicMainContract.getBalance();
        userContractBalanceAfter = await user12.getBalance();

        expect(userDataBefore.balance).toEqual(userDataAfter.balance + toNano(SubscriptionPrices.MonthlyAfter30Days));
        expect(await hypersonicMainContract.getNumberOfSubscribedUsers()).toEqual(5n);

        user1MatrixData = await users[1].getMatrixUserData();
        user2MatrixData = await users[2].getMatrixUserData();
        let user12MatrixData = await user12.getMatrixUserData();

        expect(user12MatrixData.parentUser?.toString()).toEqual(user2Wallet.getSender().address.toString());
        expect(user12MatrixData.matrixStatuses?.matrixSubscriptionActive).toEqual(true);
        expect(user12MatrixData.matrixSubscriptionType).toEqual(SubscriptionType.MonthlyAfter30Days);
        expect(Number(user12MatrixData.matrixRegistrationDate) / 1000).toBeCloseTo(
            Math.floor(Date.now() / 1000) / 1000,
        );
        expect(Number(user12MatrixData.matrixExpirationDate) / 1000).toBeCloseTo(
            (Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60) / 1000,
        );

        expect(user1MatrixData.leftChildUser?.toString()).toEqual(user2Wallet.getSender().address.toString());
        expect(user1MatrixData.middleChildUser?.toString()).toEqual(user10Wallet.getSender().address.toString());
        expect(user1MatrixData.rightChildUser?.toString()).toEqual(user11Wallet.getSender().address.toString());

        expect(user2MatrixData.leftChildUser?.toString()).toEqual(user12Wallet.getSender().address.toString());

        if (showLogs) {
            console.table([
                {
                    Description: 'User 12 Wallet Balance Fees After Matrix Subscription',
                    'Amount (TON)': (
                        Number(userWalletBalanceBefore) / Number(toNano(1)) -
                        Number(userWalletBalanceAfter) / Number(toNano(1))
                    ).toFixed(5),
                },
                {
                    Description: 'Main Contract Transaction Fees After Matrix Subscription',
                    'Amount (TON)': (
                        Number(mainContractBalanceBefore) / Number(toNano(1)) -
                        Number(mainContractBalanceAfter) / Number(toNano(1))
                    ).toFixed(5),
                },
                {
                    Description: 'User 12 Contract Transaction Fees After Matrix Subscription',
                    'Amount (TON)': (
                        Number(userContractBalanceBefore) / Number(toNano(1)) -
                        Number(userContractBalanceAfter) / Number(toNano(1))
                    ).toFixed(5),
                },
            ]);
        }
    };

    const checkMonthlyDistributions = async (showLogs: boolean = false) => {
        const userWallets = [
            companyWallet,
            user1Wallet,
            user2Wallet,
            user3Wallet,
            user4Wallet,
            user5Wallet,
            user6Wallet,
            user7Wallet,
            user8Wallet,
            user9Wallet,
            user10Wallet,
            user11Wallet,
            user12Wallet,
        ];

        const users = await Promise.all(
            userWallets.map(async (wallet) => {
                return blockchain.openContract(await HypersonicUserContract.fromInit(wallet.getSender().address));
            }),
        );

        const user1MatrixData = await convertAddressToMatrixMemberData(user1Wallet.getSender().address, blockchain);
        const user1MatrixArray = await getUserMatrixData(user1MatrixData, blockchain);
        const user1DirectSponsorsMatrices = await getUserDirectSponsorsMatrices(user1MatrixData, blockchain);
        const user12ndGenSponsorsMatrices = await getUser2ndGenSponsorsMatrices(user1MatrixData, blockchain);

        const user1DistributionData = await calculateMatrixDistributionData(
            user1MatrixData,
            user1MatrixArray,
            user1DirectSponsorsMatrices,
            user12ndGenSponsorsMatrices,
        );

        let companyWalletBalanceBefore = await companyWallet.getBalance();
        let userBalanceBefore = (await users[1].getUniLevelUserData()).balance;
        let senderWalletBalanceBefore = await deployer.getBalance();
        let contractBalanceBefore = await hypersonicMainContract.getBalance();

        const user1MonthlyDistributionResult = {
            $$type: 'MonthlyDistribution' as const,
            walletAddress: user1Wallet.getSender().address,
            memberRevenue: toNano(user1DistributionData.memberRevenue),
            companyRevenue: toNano(user1DistributionData.companyRevenue),
            subscriptionFee: toNano(user1DistributionData.subscriptionFee),
            contractKey: contractKey,
        };

        const user1MonthlyDistributions: Dictionary<bigint, MonthlyDistribution> = Dictionary.empty();
        user1MonthlyDistributions.set(1n, user1MonthlyDistributionResult);

        const user1MonthlyDistributionListResult = await hypersonicMainContract.send(
            deployer.getSender(),
            {
                value: toNano('0.25'),
            },
            {
                $$type: 'MonthlyDistributionList',
                monthlyDistributions: user1MonthlyDistributions,
                numberOfDistributions: 1n,
                contractKey: contractKey,
            },
        );

        let companyWalletBalanceAfter = await companyWallet.getBalance();
        let userBalanceAfter = (await users[1].getUniLevelUserData()).balance;
        let senderWalletBalanceAfter = await deployer.getBalance();
        let contractBalanceAfter = await hypersonicMainContract.getBalance();

        expect(Number(fromNano(companyWalletBalanceAfter - companyWalletBalanceBefore))).toBeCloseTo(
            Number(user1DistributionData.companyRevenue),
        );
        expect(Number(fromNano(userBalanceAfter - userBalanceBefore))).toBeCloseTo(
            Number(user1DistributionData.memberRevenue - user1DistributionData.subscriptionFee),
        );

        if (showLogs) {
            console.log('-------------------------------------------------');
            console.table([
                {
                    Description: 'User 1 Distribution Member Revenue',
                    'Amount (TON)': Number(user1DistributionData.memberRevenue).toFixed(5),
                },
                {
                    Description: 'User 1 Distribution Company Revenue',
                    'Amount (TON)': Number(user1DistributionData.companyRevenue).toFixed(5),
                },
                {
                    Description: 'User 1 Distribution Subscription Fee',
                    'Amount (TON)': Number(user1DistributionData.subscriptionFee).toFixed(5),
                },
                {
                    Description: 'Company Wallet Balance Before Distribution',
                    'Amount (TON)': Number(fromNano(companyWalletBalanceBefore)).toFixed(5),
                },
                {
                    Description: 'Company Wallet Balance After Distribution',
                    'Amount (TON)': Number(fromNano(companyWalletBalanceAfter)).toFixed(5),
                },
                {
                    Description: 'User Wallet Balance Before Distribution',
                    'Amount (TON)': Number(fromNano(userBalanceBefore)).toFixed(5),
                },
                {
                    Description: 'User Wallet Balance After Distribution',
                    'Amount (TON)': Number(fromNano(userBalanceAfter)).toFixed(5),
                },
                {
                    Description: 'Master Wallet Deployer Transaction Fees For Distribution',
                    'Amount (TON)': (
                        Number(senderWalletBalanceBefore) / Number(toNano(1)) -
                        Number(senderWalletBalanceAfter) / Number(toNano(1))
                    ).toFixed(5),
                },
                {
                    Description: 'Main Contract Fees For Distribution',
                    'Amount (TON)': (
                        Number(contractBalanceBefore) / Number(toNano(1)) -
                        Number(contractBalanceAfter) / Number(toNano(1))
                    ).toFixed(5),
                },
                {
                    Description: 'User Contract Balance After Distribution',
                    'Amount (TON)': (Number(await users[1].getBalance()) / Number(toNano(1))).toFixed(5),
                },
            ]);
        }

        const user2MatrixData = await convertAddressToMatrixMemberData(user2Wallet.getSender().address, blockchain);
        const user2MatrixArray = await getUserMatrixData(user2MatrixData, blockchain);
        const user2DirectSponsorsMatrices = await getUserDirectSponsorsMatrices(user2MatrixData, blockchain);
        const user22ndGenSponsorsMatrices = await getUser2ndGenSponsorsMatrices(user2MatrixData, blockchain);

        const user2DistributionData = await calculateMatrixDistributionData(
            user2MatrixData,
            user2MatrixArray,
            user2DirectSponsorsMatrices,
            user22ndGenSponsorsMatrices,
        );

        companyWalletBalanceBefore = await companyWallet.getBalance();
        userBalanceBefore = (await users[2].getUniLevelUserData()).balance;
        senderWalletBalanceBefore = await deployer.getBalance();
        contractBalanceBefore = await hypersonicMainContract.getBalance();

        const user2MonthlyDistributionResult = {
            $$type: 'MonthlyDistribution' as const,
            walletAddress: user2Wallet.getSender().address,
            memberRevenue: toNano(user2DistributionData.memberRevenue),
            companyRevenue: toNano(user2DistributionData.companyRevenue),
            subscriptionFee: toNano(user2DistributionData.subscriptionFee),
            contractKey: contractKey,
        };

        const user2MonthlyDistributions: Dictionary<bigint, MonthlyDistribution> = Dictionary.empty();
        user2MonthlyDistributions.set(1n, user2MonthlyDistributionResult);

        const user2MonthlyDistributionListResult = await hypersonicMainContract.send(
            deployer.getSender(),
            {
                value: toNano('0.25'),
            },
            {
                $$type: 'MonthlyDistributionList',
                monthlyDistributions: user2MonthlyDistributions,
                numberOfDistributions: 1n,
                contractKey: contractKey,
            },
        );

        companyWalletBalanceAfter = await companyWallet.getBalance();
        userBalanceAfter = (await users[2].getUniLevelUserData()).balance;
        senderWalletBalanceAfter = await deployer.getBalance();
        contractBalanceAfter = await hypersonicMainContract.getBalance();

        expect(Number(fromNano(companyWalletBalanceAfter - companyWalletBalanceBefore))).toBeCloseTo(
            Number(user2DistributionData.companyRevenue),
        );
        expect(Number(fromNano(userBalanceAfter - userBalanceBefore))).toBeCloseTo(
            Number(user2DistributionData.memberRevenue - user2DistributionData.subscriptionFee),
        );

        if (showLogs) {
            console.table([
                {
                    Description: 'User 2 Distribution Member Revenue',
                    'Amount (TON)': Number(user2DistributionData.memberRevenue).toFixed(5),
                },
                {
                    Description: 'User 2 Distribution Company Revenue',
                    'Amount (TON)': Number(user2DistributionData.companyRevenue).toFixed(5),
                },
                {
                    Description: 'User 2 Distribution Subscription Fee',
                    'Amount (TON)': Number(user2DistributionData.subscriptionFee).toFixed(5),
                },
                {
                    Description: 'Company Wallet Balance Before Distribution',
                    'Amount (TON)': Number(fromNano(companyWalletBalanceBefore)).toFixed(5),
                },
                {
                    Description: 'Company Wallet Balance After Distribution',
                    'Amount (TON)': Number(fromNano(companyWalletBalanceAfter)).toFixed(5),
                },
                {
                    Description: 'User Wallet Balance Before Distribution',
                    'Amount (TON)': Number(fromNano(userBalanceBefore)).toFixed(5),
                },
                {
                    Description: 'User Wallet Balance After Distribution',
                    'Amount (TON)': Number(fromNano(userBalanceAfter)).toFixed(5),
                },
                {
                    Description: 'Master Wallet Deployer Transaction Fees For Distribution',
                    'Amount (TON)': (
                        Number(senderWalletBalanceBefore) / Number(toNano(1)) -
                        Number(senderWalletBalanceAfter) / Number(toNano(1))
                    ).toFixed(5),
                },
                {
                    Description: 'Main Contract Fees For Distribution',
                    'Amount (TON)': (
                        Number(contractBalanceBefore) / Number(toNano(1)) -
                        Number(contractBalanceAfter) / Number(toNano(1))
                    ).toFixed(5),
                },
                {
                    Description: 'User Contract Balance After Distribution',
                    'Amount (TON)': (Number(await users[2].getBalance()) / Number(toNano(1))).toFixed(5),
                },
            ]);
        }

        const user10MatrixData = await convertAddressToMatrixMemberData(user10Wallet.getSender().address, blockchain);
        const user10MatrixArray = await getUserMatrixData(user10MatrixData, blockchain);
        const user10DirectSponsorsMatrices = await getUserDirectSponsorsMatrices(user10MatrixData, blockchain);
        const user102ndGenSponsorsMatrices = await getUser2ndGenSponsorsMatrices(user10MatrixData, blockchain);

        const user10DistributionData = await calculateMatrixDistributionData(
            user10MatrixData,
            user10MatrixArray,
            user10DirectSponsorsMatrices,
            user102ndGenSponsorsMatrices,
        );

        companyWalletBalanceBefore = await companyWallet.getBalance();
        userBalanceBefore = (await users[10].getUniLevelUserData()).balance;
        senderWalletBalanceBefore = await deployer.getBalance();
        contractBalanceBefore = await hypersonicMainContract.getBalance();

        const user10MonthlyDistributionResult = {
            $$type: 'MonthlyDistribution' as const,
            walletAddress: user10Wallet.getSender().address,
            memberRevenue: toNano(user10DistributionData.memberRevenue),
            companyRevenue: toNano(user10DistributionData.companyRevenue),
            subscriptionFee: toNano(user10DistributionData.subscriptionFee),
            contractKey: contractKey,
        };

        const user10MonthlyDistributions: Dictionary<bigint, MonthlyDistribution> = Dictionary.empty();
        user10MonthlyDistributions.set(1n, user10MonthlyDistributionResult);

        const user10MonthlyDistributionListResult = await hypersonicMainContract.send(
            deployer.getSender(),
            {
                value: toNano('0.25'),
            },
            {
                $$type: 'MonthlyDistributionList',
                monthlyDistributions: user10MonthlyDistributions,
                numberOfDistributions: 1n,
                contractKey: contractKey,
            },
        );

        companyWalletBalanceAfter = await companyWallet.getBalance();
        userBalanceAfter = (await users[10].getUniLevelUserData()).balance;
        senderWalletBalanceAfter = await deployer.getBalance();
        contractBalanceAfter = await hypersonicMainContract.getBalance();

        expect(Number(fromNano(companyWalletBalanceAfter - companyWalletBalanceBefore))).toBeCloseTo(
            Number(user10DistributionData.companyRevenue),
        );
        expect(Number(fromNano(userBalanceAfter - userBalanceBefore))).toBeCloseTo(
            Number(user10DistributionData.memberRevenue - user10DistributionData.subscriptionFee),
        );

        if (showLogs) {
            console.table([
                {
                    Description: 'User 10 Distribution Member Revenue',
                    'Amount (TON)': Number(user10DistributionData.memberRevenue).toFixed(5),
                },
                {
                    Description: 'User 10 Distribution Company Revenue',
                    'Amount (TON)': Number(user10DistributionData.companyRevenue).toFixed(5),
                },
                {
                    Description: 'User 10 Distribution Subscription Fee',
                    'Amount (TON)': Number(user10DistributionData.subscriptionFee).toFixed(5),
                },
                {
                    Description: 'Company Wallet Balance Before Distribution',
                    'Amount (TON)': Number(fromNano(companyWalletBalanceBefore)).toFixed(5),
                },
                {
                    Description: 'Company Wallet Balance After Distribution',
                    'Amount (TON)': Number(fromNano(companyWalletBalanceAfter)).toFixed(5),
                },
                {
                    Description: 'User Wallet Balance Before Distribution',
                    'Amount (TON)': Number(fromNano(userBalanceBefore)).toFixed(5),
                },
                {
                    Description: 'User Wallet Balance After Distribution',
                    'Amount (TON)': Number(fromNano(userBalanceAfter)).toFixed(5),
                },
                {
                    Description: 'Master Wallet Deployer Transaction Fees For Distribution',
                    'Amount (TON)': (
                        Number(senderWalletBalanceBefore) / Number(toNano(1)) -
                        Number(senderWalletBalanceAfter) / Number(toNano(1))
                    ).toFixed(5),
                },
                {
                    Description: 'Main Contract Fees For Distribution',
                    'Amount (TON)': (
                        Number(contractBalanceBefore) / Number(toNano(1)) -
                        Number(contractBalanceAfter) / Number(toNano(1))
                    ).toFixed(5),
                },
                {
                    Description: 'User Contract Balance After Distribution',
                    'Amount (TON)': (Number(await users[2].getBalance()) / Number(toNano(1))).toFixed(5),
                },
            ]);
        }

        const user11MatrixData = await convertAddressToMatrixMemberData(user11Wallet.getSender().address, blockchain);
        const user11MatrixArray = await getUserMatrixData(user11MatrixData, blockchain);
        const user11DirectSponsorsMatrices = await getUserDirectSponsorsMatrices(user11MatrixData, blockchain);
        const user112ndGenSponsorsMatrices = await getUser2ndGenSponsorsMatrices(user11MatrixData, blockchain);

        const user11DistributionData = await calculateMatrixDistributionData(
            user11MatrixData,
            user11MatrixArray,
            user11DirectSponsorsMatrices,
            user112ndGenSponsorsMatrices,
        );

        companyWalletBalanceBefore = await companyWallet.getBalance();
        userBalanceBefore = (await users[11].getUniLevelUserData()).balance;
        senderWalletBalanceAfter = await deployer.getBalance();
        contractBalanceBefore = await hypersonicMainContract.getBalance();
        const user11MonthlyDistributionResult = {
            $$type: 'MonthlyDistribution' as const,
            walletAddress: user11Wallet.getSender().address,
            memberRevenue: toNano(user11DistributionData.memberRevenue),
            companyRevenue: toNano(user11DistributionData.companyRevenue),
            subscriptionFee: toNano(user11DistributionData.subscriptionFee),
            contractKey: contractKey,
        };

        const user11MonthlyDistributions: Dictionary<bigint, MonthlyDistribution> = Dictionary.empty();
        user11MonthlyDistributions.set(1n, user11MonthlyDistributionResult);

        const user11MonthlyDistributionListResult = await hypersonicMainContract.send(
            deployer.getSender(),
            {
                value: toNano('0.25'),
            },
            {
                $$type: 'MonthlyDistributionList',
                monthlyDistributions: user11MonthlyDistributions,
                numberOfDistributions: 1n,
                contractKey: contractKey,
            },
        );

        companyWalletBalanceAfter = await companyWallet.getBalance();
        userBalanceAfter = (await users[11].getUniLevelUserData()).balance;
        senderWalletBalanceAfter = await deployer.getBalance();
        contractBalanceAfter = await hypersonicMainContract.getBalance();

        expect(Number(fromNano(companyWalletBalanceAfter - companyWalletBalanceBefore))).toBeCloseTo(
            Number(user11DistributionData.companyRevenue),
        );
        expect(Number(fromNano(userBalanceAfter - userBalanceBefore))).toBeCloseTo(
            Number(user11DistributionData.memberRevenue - user11DistributionData.subscriptionFee),
        );

        if (showLogs) {
            console.table([
                {
                    Description: 'User 11 Distribution Member Revenue',
                    'Amount (TON)': Number(user11DistributionData.memberRevenue).toFixed(5),
                },
                {
                    Description: 'User 11 Distribution Company Revenue',
                    'Amount (TON)': Number(user11DistributionData.companyRevenue).toFixed(5),
                },
                {
                    Description: 'User 11 Distribution Subscription Fee',
                    'Amount (TON)': Number(user11DistributionData.subscriptionFee).toFixed(5),
                },
                {
                    Description: 'Company Wallet Balance Before Distribution',
                    'Amount (TON)': Number(fromNano(companyWalletBalanceBefore)).toFixed(5),
                },
                {
                    Description: 'Company Wallet Balance After Distribution',
                    'Amount (TON)': Number(fromNano(companyWalletBalanceAfter)).toFixed(5),
                },
                {
                    Description: 'User Wallet Balance Before Distribution',
                    'Amount (TON)': Number(fromNano(userBalanceBefore)).toFixed(5),
                },
                {
                    Description: 'User Wallet Balance After Distribution',
                    'Amount (TON)': Number(fromNano(userBalanceAfter)).toFixed(5),
                },
                {
                    Description: 'Master Wallet Deployer Transaction Fees For Distribution',
                    'Amount (TON)': (
                        Number(senderWalletBalanceBefore) / Number(toNano(1)) -
                        Number(senderWalletBalanceAfter) / Number(toNano(1))
                    ).toFixed(5),
                },
                {
                    Description: 'Main Contract Fees For Distribution',
                    'Amount (TON)': (
                        Number(contractBalanceBefore) / Number(toNano(1)) -
                        Number(contractBalanceAfter) / Number(toNano(1))
                    ).toFixed(5),
                },
                {
                    Description: 'User Contract Balance After Distribution',
                    'Amount (TON)': (Number(await users[2].getBalance()) / Number(toNano(1))).toFixed(5),
                },
            ]);
        }

        const user12MatrixData = await convertAddressToMatrixMemberData(user12Wallet.getSender().address, blockchain);
        const user12MatrixArray = await getUserMatrixData(user12MatrixData, blockchain);
        const user12DirectSponsorsMatrices = await getUserDirectSponsorsMatrices(user12MatrixData, blockchain);
        const user122ndGenSponsorsMatrices = await getUser2ndGenSponsorsMatrices(user12MatrixData, blockchain);

        const user12DistributionData = await calculateMatrixDistributionData(
            user12MatrixData,
            user12MatrixArray,
            user12DirectSponsorsMatrices,
            user122ndGenSponsorsMatrices,
        );

        companyWalletBalanceBefore = await companyWallet.getBalance();
        userBalanceBefore = (await user12.getUniLevelUserData()).balance;
        senderWalletBalanceBefore = await deployer.getBalance();
        contractBalanceBefore = await hypersonicMainContract.getBalance();

        const user12MonthlyDistributionResult = {
            $$type: 'MonthlyDistribution' as const,
            walletAddress: user12Wallet.getSender().address,
            memberRevenue: toNano(user12DistributionData.memberRevenue),
            companyRevenue: toNano(user12DistributionData.companyRevenue),
            subscriptionFee: toNano(user12DistributionData.subscriptionFee),
            contractKey: contractKey,
        };

        const user12MonthlyDistributions: Dictionary<bigint, MonthlyDistribution> = Dictionary.empty();
        user12MonthlyDistributions.set(1n, user12MonthlyDistributionResult);

        const user12MonthlyDistributionListResult = await hypersonicMainContract.send(
            deployer.getSender(),
            {
                value: toNano('0.25'),
            },
            {
                $$type: 'MonthlyDistributionList',
                monthlyDistributions: user12MonthlyDistributions,
                numberOfDistributions: 1n,
                contractKey: contractKey,
            },
        );

        companyWalletBalanceAfter = await companyWallet.getBalance();
        userBalanceAfter = (await user12.getUniLevelUserData()).balance;
        senderWalletBalanceAfter = await deployer.getBalance();
        contractBalanceAfter = await hypersonicMainContract.getBalance();

        expect(Number(fromNano(companyWalletBalanceAfter - companyWalletBalanceBefore))).toBeCloseTo(
            Number(user12DistributionData.companyRevenue),
        );
        expect(Number(fromNano(userBalanceAfter - userBalanceBefore))).toBeCloseTo(
            Number(user12DistributionData.memberRevenue - user12DistributionData.subscriptionFee),
        );

        if (showLogs) {
            console.table([
                {
                    Description: 'User 12 Distribution Member Revenue',
                    'Amount (TON)': Number(user12DistributionData.memberRevenue).toFixed(5),
                },
                {
                    Description: 'User 12 Distribution Company Revenue',
                    'Amount (TON)': Number(user12DistributionData.companyRevenue).toFixed(5),
                },
                {
                    Description: 'User 12 Distribution Subscription Fee',
                    'Amount (TON)': Number(user12DistributionData.subscriptionFee).toFixed(5),
                },
                {
                    Description: 'Company Wallet Balance Before Distribution',
                    'Amount (TON)': Number(fromNano(companyWalletBalanceBefore)).toFixed(5),
                },
                {
                    Description: 'Company Wallet Balance After Distribution',
                    'Amount (TON)': Number(fromNano(companyWalletBalanceAfter)).toFixed(5),
                },
                {
                    Description: 'User Wallet Balance Before Distribution',
                    'Amount (TON)': Number(fromNano(userBalanceBefore)).toFixed(5),
                },
                {
                    Description: 'User Wallet Balance After Distribution',
                    'Amount (TON)': Number(fromNano(userBalanceAfter)).toFixed(5),
                },
                {
                    Description: 'Master Wallet Deployer Transaction Fees For Distribution',
                    'Amount (TON)': (
                        Number(senderWalletBalanceBefore) / Number(toNano(1)) -
                        Number(senderWalletBalanceAfter) / Number(toNano(1))
                    ).toFixed(5),
                },
                {
                    Description: 'Main Contract Fees For Distribution',
                    'Amount (TON)': (
                        Number(contractBalanceBefore) / Number(toNano(1)) -
                        Number(contractBalanceAfter) / Number(toNano(1))
                    ).toFixed(5),
                },
                {
                    Description: 'User Contract Balance After Distribution',
                    'Amount (TON)': (Number(await users[2].getBalance()) / Number(toNano(1))).toFixed(5),
                },
            ]);
        }
    };

    const checkAdminWithdrawal = async (showLogs: boolean = false) => {
        const withdrawalAmount = toNano('500');

        const contractBalanceBefore = await hypersonicMainContract.getBalance();
        const deployerWalletBalanceBefore = await deployer.getBalance();

        const adminWithdrawalResult = await hypersonicMainContract.send(
            deployer.getSender(),
            {
                value: toNano('0.25'),
            },
            {
                $$type: 'AdminWithdrawal',
                amount: withdrawalAmount,
                contractKey: contractKey,
            },
        );

        const contractBalanceAfter = await hypersonicMainContract.getBalance();
        const deployerWalletBalanceAfter = await deployer.getBalance();

        expect(Number(fromNano(contractBalanceBefore - contractBalanceAfter))).toBeCloseTo(
            Number(fromNano(withdrawalAmount)),
            1,
        );
        expect(Number(fromNano(deployerWalletBalanceAfter - deployerWalletBalanceBefore))).toBeCloseTo(
            Number(fromNano(withdrawalAmount)),
            1,
        );
    };

    const checkGracePeriodForMatrixSubscriptions = async (showLogs: boolean = false) => {
        const userWallets = [
            companyWallet,
            user1Wallet,
            user2Wallet,
            user3Wallet,
            user4Wallet,
            user5Wallet,
            user6Wallet,
            user7Wallet,
            user8Wallet,
            user9Wallet,
            user10Wallet,
            user11Wallet,
            user12Wallet,
        ];

        const users = await Promise.all(
            userWallets.map(async (wallet) => {
                return blockchain.openContract(await HypersonicUserContract.fromInit(wallet.getSender().address));
            }),
        );

        const user10ComputedMatrixData = await convertAddressToMatrixMemberData(
            user10Wallet.getSender().address,
            blockchain,
        );
        const user10MatrixArray = await getUserMatrixData(user10ComputedMatrixData, blockchain);
        const user10DirectSponsorsMatrices = await getUserDirectSponsorsMatrices(user10ComputedMatrixData, blockchain);
        const user102ndGenSponsorsMatrices = await getUser2ndGenSponsorsMatrices(user10ComputedMatrixData, blockchain);

        const user10DistributionData = await calculateMatrixDistributionData(
            user10ComputedMatrixData,
            user10MatrixArray,
            user10DirectSponsorsMatrices,
            user102ndGenSponsorsMatrices,
        );

        const user10UnilevelData = await users[10].getUniLevelUserData();
        const user10MatrixData = await users[10].getMatrixUserData();

        expect(user10MatrixData.matrixStatuses?.matrixSubscriptionActive).toBe(true);
        expect(user10MatrixData.matrixStatuses?.matrixSubscriptionGracePeriodActive).toBe(false);

        const user10WithdrawResult = await hypersonicMainContract.send(
            user10Wallet.getSender(),
            {
                value: toNano(0.25),
            },
            {
                $$type: 'Withdraw',
                walletAddress: user10Wallet.getSender().address,
                amount: toNano(80),
                contractKey: contractKey,
            },
        );

        const user10UnilevelDataAfterWithdrawal = await users[10].getUniLevelUserData();

        const user10MonthlyDistributionResult = {
            $$type: 'MonthlyDistribution' as const,
            walletAddress: user10Wallet.getSender().address,
            memberRevenue: toNano(user10DistributionData.memberRevenue),
            companyRevenue: toNano(user10DistributionData.companyRevenue),
            subscriptionFee: toNano(user10DistributionData.subscriptionFee),
            contractKey: contractKey,
        };

        const user10MonthlyDistributions: Dictionary<bigint, MonthlyDistribution> = Dictionary.empty();
        user10MonthlyDistributions.set(1n, user10MonthlyDistributionResult);

        const user10MonthlyDistributionResult1 = await hypersonicMainContract.send(
            deployer.getSender(),
            {
                value: toNano('0.25'),
            },
            {
                $$type: 'MonthlyDistributionList',
                monthlyDistributions: user10MonthlyDistributions,
                numberOfDistributions: 1n,
                contractKey: contractKey,
            },
        );

        const user10MatrixDataAfterFirstMonthlyDistribution = await users[10].getMatrixUserData();

        expect(user10MatrixDataAfterFirstMonthlyDistribution.matrixStatuses?.matrixSubscriptionActive).toBe(true);
        expect(user10MatrixDataAfterFirstMonthlyDistribution.matrixStatuses?.matrixSubscriptionGracePeriodActive).toBe(
            true,
        );

        const user10ComputedMatrixData2 = await convertAddressToMatrixMemberData(
            user10Wallet.getSender().address,
            blockchain,
        );
        const user10MatrixArray2 = await getUserMatrixData(user10ComputedMatrixData2, blockchain);
        const user10DirectSponsorsMatrices2 = await getUserDirectSponsorsMatrices(
            user10ComputedMatrixData2,
            blockchain,
        );
        const user102ndGenSponsorsMatrices2 = await getUser2ndGenSponsorsMatrices(
            user10ComputedMatrixData2,
            blockchain,
        );

        const user10DistributionData2 = await calculateMatrixDistributionData(
            user10ComputedMatrixData2,
            user10MatrixArray2,
            user10DirectSponsorsMatrices2,
            user102ndGenSponsorsMatrices2,
        );

        const user10MonthlyDistributionResult2 = {
            $$type: 'MonthlyDistribution' as const,
            walletAddress: user10Wallet.getSender().address,
            memberRevenue: toNano(user10DistributionData2.memberRevenue),
            companyRevenue: toNano(user10DistributionData2.companyRevenue),
            subscriptionFee: toNano(user10DistributionData2.subscriptionFee),
            contractKey: contractKey,
        };

        const user10MonthlyDistributions2: Dictionary<bigint, MonthlyDistribution> = Dictionary.empty();
        user10MonthlyDistributions2.set(1n, user10MonthlyDistributionResult2);

        const user10MonthlyDistributionListResult2 = await hypersonicMainContract.send(
            deployer.getSender(),
            {
                value: toNano('0.25'),
            },
            {
                $$type: 'MonthlyDistributionList',
                monthlyDistributions: user10MonthlyDistributions2,
                numberOfDistributions: 1n,
                contractKey: contractKey,
            },
        );

        const user10MatrixDataAfterSecondMonthlyDistribution = await users[10].getMatrixUserData();

        expect(user10MatrixDataAfterSecondMonthlyDistribution.matrixStatuses?.matrixSubscriptionActive).toBe(false);
        expect(user10MatrixDataAfterSecondMonthlyDistribution.matrixStatuses?.matrixSubscriptionGracePeriodActive).toBe(
            false,
        );

        const user11ComputedMatrixData = await convertAddressToMatrixMemberData(
            user11Wallet.getSender().address,
            blockchain,
        );
        const user11MatrixArray = await getUserMatrixData(user11ComputedMatrixData, blockchain);
        const user11DirectSponsorsMatrices = await getUserDirectSponsorsMatrices(user11ComputedMatrixData, blockchain);
        const user112ndGenSponsorsMatrices = await getUser2ndGenSponsorsMatrices(user11ComputedMatrixData, blockchain);

        const user11DistributionData = await calculateMatrixDistributionData(
            user11ComputedMatrixData,
            user11MatrixArray,
            user11DirectSponsorsMatrices,
            user112ndGenSponsorsMatrices,
        );

        const user11UnilevelData = await users[11].getUniLevelUserData();
        const user11MatrixData = await users[11].getMatrixUserData();

        expect(user11MatrixData.matrixStatuses?.matrixSubscriptionActive).toBe(true);
        expect(user11MatrixData.matrixStatuses?.matrixSubscriptionGracePeriodActive).toBe(false);

        const user11WithdrawResult = await hypersonicMainContract.send(
            user11Wallet.getSender(),
            {
                value: toNano(0.25),
            },
            {
                $$type: 'Withdraw',
                walletAddress: user11Wallet.getSender().address,
                amount: toNano(80),
                contractKey: contractKey,
            },
        );

        const user11UnilevelDataAfterWithdrawal = await users[11].getUniLevelUserData();

        const user11MonthlyDistributionResult1 = {
            $$type: 'MonthlyDistribution' as const,
            walletAddress: user11Wallet.getSender().address,
            memberRevenue: toNano(user11DistributionData.memberRevenue),
            companyRevenue: toNano(user11DistributionData.companyRevenue),
            subscriptionFee: toNano(user11DistributionData.subscriptionFee),
            contractKey: contractKey,
        };

        const user11MonthlyDistributions: Dictionary<bigint, MonthlyDistribution> = Dictionary.empty();
        user11MonthlyDistributions.set(1n, user11MonthlyDistributionResult1);

        const user11MonthlyDistributionListResult1 = await hypersonicMainContract.send(
            deployer.getSender(),
            {
                value: toNano('0.25'),
            },
            {
                $$type: 'MonthlyDistributionList',
                monthlyDistributions: user11MonthlyDistributions,
                numberOfDistributions: 1n,
                contractKey: contractKey,
            },
        );

        const user11MatrixDataAfterFirstMonthlyDistribution = await users[11].getMatrixUserData();

        expect(user11MatrixDataAfterFirstMonthlyDistribution.matrixStatuses?.matrixSubscriptionActive).toBe(true);
        expect(user11MatrixDataAfterFirstMonthlyDistribution.matrixStatuses?.matrixSubscriptionGracePeriodActive).toBe(
            true,
        );

        const user11ComputedMatrixData2 = await convertAddressToMatrixMemberData(
            user11Wallet.getSender().address,
            blockchain,
        );
        const user11MatrixArray2 = await getUserMatrixData(user11ComputedMatrixData2, blockchain);
        const user11DirectSponsorsMatrices2 = await getUserDirectSponsorsMatrices(
            user11ComputedMatrixData2,
            blockchain,
        );
        const user112ndGenSponsorsMatrices2 = await getUser2ndGenSponsorsMatrices(
            user11ComputedMatrixData2,
            blockchain,
        );

        const user11DistributionData2 = await calculateMatrixDistributionData(
            user11ComputedMatrixData2,
            user11MatrixArray2,
            user11DirectSponsorsMatrices2,
            user112ndGenSponsorsMatrices2,
        );

        const user11DepositResult = await hypersonicMainContract.send(
            user11Wallet.getSender(),
            {
                value: toNano(10 + 0.25),
            },
            {
                $$type: 'Deposit',
                walletAddress: user11Wallet.getSender().address,
                amount: toNano(10),
                contractKey: contractKey,
            },
        );

        const user11MonthlyDistributionResult2 = {
            $$type: 'MonthlyDistribution' as const,
            walletAddress: user11Wallet.getSender().address,
            memberRevenue: toNano(user11DistributionData2.memberRevenue),
            companyRevenue: toNano(user11DistributionData2.companyRevenue),
            subscriptionFee: toNano(user11DistributionData2.subscriptionFee),
            contractKey: contractKey,
        };

        const user11MonthlyDistributions2: Dictionary<bigint, MonthlyDistribution> = Dictionary.empty();
        user11MonthlyDistributions2.set(1n, user11MonthlyDistributionResult2);

        const user11MonthlyDistributionListResult2 = await hypersonicMainContract.send(
            deployer.getSender(),
            {
                value: toNano('0.25'),
            },
            {
                $$type: 'MonthlyDistributionList',
                monthlyDistributions: user11MonthlyDistributions2,
                numberOfDistributions: 1n,
                contractKey: contractKey,
            },
        );

        const user11MatrixDataAfterSecondMonthlyDistribution = await users[11].getMatrixUserData();

        expect(user11MatrixDataAfterSecondMonthlyDistribution.matrixStatuses?.matrixSubscriptionActive).toBe(true);
        expect(user11MatrixDataAfterSecondMonthlyDistribution.matrixStatuses?.matrixSubscriptionGracePeriodActive).toBe(
            false,
        );
    };

    it('should allow users to register', async () => {
        await checkRegistration(true);
    });

    // TODO: Add versions where it should not allow them to deposit
    it('should allow users to deposit', async () => {
        await checkRegistration();
        await checkDeposit(100, true);
    });

    it('should allow users to withdraw', async () => {
        await checkRegistration();
        await checkDeposit(100);
        await checkWithdraw(100, 50, true);
    });

    it('should correctly keep track of uplines up to 7 levels', async () => {
        await checkRegistration();
        await checkUplines(true);
    });

    it('should allow users to upgrade their package plans', async () => {
        await checkRegistration();
        await checkUplines();
        await depositBalanceForTestUsers(100);
        await checkUpgradePlans(true);
    });

    it('should allow users to withdraw extra TON from their user contract', async () => {
        await checkRegistration();
        await checkUplines();
        await depositBalanceForTestUsers(100);
        await checkUpgradePlans();
        await checkWithdrawUserContractTonBalance(true);
    });

    it('should allow users to subscribe to the matrix', async () => {
        await checkRegistration();
        await checkUplines();
        await depositBalanceForTestUsers(100);
        await checkUpgradePlans();
        await checkSubscribeToMatrix(true);
    });

    it('should allow monthly subscriptions to be distributed to the matrix correctly', async () => {
        await checkRegistration();
        await checkUplines();
        await depositBalanceForTestUsers(100);
        await checkUpgradePlans();
        await checkSubscribeToMatrix();
        await checkMonthlyDistributions(true);
    });

    it('should allow a grace period for matrix subscriptions before they become deactivated', async () => {
        await checkRegistration();
        await checkUplines();
        await depositBalanceForTestUsers(100);
        await checkUpgradePlans();
        await checkSubscribeToMatrix();
        await checkGracePeriodForMatrixSubscriptions(true);
    });

    it('should allow the admin to withdraw from the main contract', async () => {
        await checkRegistration();
        await checkUplines();
        await depositBalanceForTestUsers(100);
        await checkAdminWithdrawal(true);
    });

    it('should allow the admin to preregister users with specific matrix placements and package levels', async () => {
        const uplineMapping: Dictionary<bigint, Address> = Dictionary.empty();
        uplineMapping.set(1n, companyWallet.getSender().address);

        const preRegisterData = {
            walletAddress: user1Wallet.getSender().address,
            username: 'preUser1',
            upline: {
                $$type: 'Upline' as const,
                mapping: uplineMapping,
                count: BigInt(uplineMapping.values().length),
            },
            packageLevel: 3n,
            matrixParentUser: companyWallet.getSender().address,
            matrixPosition: MatrixPosition.Left,
            subscriptionType: SubscriptionType.MonthlyWithin30Days,
            contractKey: contractKey,
        };

        // Simulate admin sending the preregistration request
        const preRegisterResult = await hypersonicMainContract.send(
            deployer.getSender(),
            {
                value: toNano('0.7'),
            },
            {
                $$type: 'PreRegisterMember',
                ...preRegisterData,
            },
        );

        expect(preRegisterResult.transactions).toHaveTransaction({
            success: true,
        });

        // Verify the user's registration details
        const registeredUser = blockchain.openContract(
            await HypersonicUserContract.fromInit(user1Wallet.getSender().address),
        );
        const userData = await registeredUser.getUniLevelUserData();
        expect(userData.username).toEqual('preUser1');
        expect(userData.walletAddress.toString()).toEqual(user1Wallet.getSender().address.toString());

        // Verify the user's package level
        expect(Number(userData.packageLevel)).toEqual(3);

        // Verify the user's matrix position
        const matrixData = await registeredUser.getMatrixUserData();

        expect(matrixData.parentUser?.toString()).toEqual(companyWallet.getSender().address.toString());
        const companyUser = blockchain.openContract(
            await HypersonicUserContract.fromInit(companyWallet.getSender().address),
        );
        const companyMatrixData = await companyUser.getMatrixUserData();
        expect(companyMatrixData.leftChildUser?.toString()).toEqual(user1Wallet.getSender().address.toString());
    });
    it('should transfer Ownership', async () => {
        const OwnerContract = await hypersonicMainContract.getOwner();
        expect(OwnerContract.toString()).toEqual(deployer.address.toString());
        const result = await hypersonicMainContract.send(
            deployer.getSender(),
            {
                value: toNano(0.05),
            },
            {
                $$type: 'ChangeOwner',
                queryId: BigInt(true),
                newOwner: newOwnerWallet.address,
            }
        )
        const newOwnerContract = await hypersonicMainContract.getOwner();
        expect(result.transactions).toHaveTransaction({
            success: true,
        });
        expect(newOwnerContract.toString()).toEqual(newOwnerWallet.address.toString());
    })
});
