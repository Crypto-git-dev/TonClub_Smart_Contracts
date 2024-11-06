import { Address, Dictionary, fromNano, toNano } from '@ton/core';
import { HypersonicMainContract, MonthlyDistribution } from '../wrappers/HypersonicMainContract';
import { NetworkProvider } from '@ton/blueprint';
import { UserService } from './prePlaceMembers';
import {
    MatrixMemberData,
    MatrixMemberPositionData,
    MatrixMonthlyDistributionData,
    SubscriptionPrices,
    SubscriptionType,
} from '../data/data-structures';
import { HypersonicUserContract } from '../build/HypersonicMainContract/tact_HypersonicUserContract';
const createCsvWriter = require('csv-writer').createObjectCsvWriter;

const memoCache = new Map<string, any>();

const memoize = (fn: Function) => {
    return async (...args: any[]) => {
        const key = JSON.stringify(args);
        if (memoCache.has(key)) {
            return memoCache.get(key);
        }
        const result = await fn(...args);
        memoCache.set(key, result);
        return result;
    };
};

const convertAddressToMatrixMemberPositionData = memoize(
    async (address: Address, provider: NetworkProvider): Promise<MatrixMemberPositionData> => {
        const userContract = provider.open(await HypersonicUserContract.fromInit(address));

        const userMatrixData = await userContract.getMatrixUserData();

        const leftChild = userMatrixData.leftChildUser
            ? await convertAddressToMatrixMemberPositionData(userMatrixData.leftChildUser, provider)
            : null;
        const middleChild = userMatrixData.middleChildUser
            ? await convertAddressToMatrixMemberPositionData(userMatrixData.middleChildUser, provider)
            : null;
        const rightChild = userMatrixData.rightChildUser
            ? await convertAddressToMatrixMemberPositionData(userMatrixData.rightChildUser, provider)
            : null;

        return {
            address: address,
            leftChild: leftChild,
            middleChild: middleChild,
            rightChild: rightChild,
            children: [leftChild, middleChild, rightChild].filter(
                (child) => child != null,
            ) as MatrixMemberPositionData[],
        };
    },
);

const convertAddressToMatrixMemberData = memoize(
    async (address: Address, provider: NetworkProvider): Promise<MatrixMemberData> => {
        const userContract = provider.open(await HypersonicUserContract.fromInit(address));

        const userMatrixData = await userContract.getMatrixUserData();
        const userUnilevelData = await userContract.getUniLevelUserData();

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
    },
);

const getUserMatrixData = async (
    baseMember: MatrixMemberData,
    provider: NetworkProvider,
    level: number = 0,
): Promise<MatrixMemberData[]> => {
    console.log(`Fetching matrix data for member ${baseMember.username} at level ${level}`);
    let members: MatrixMemberData[] = [baseMember];

    if (level < 10) {
        if (baseMember.leftChildUser) {
            const leftChildMatrixData = await convertAddressToMatrixMemberData(baseMember.leftChildUser, provider);
            await sleep(1000);
            members = members.concat(await getUserMatrixData(leftChildMatrixData, provider, level + 1));
        }

        if (baseMember.middleChildUser) {
            const middleChildMatrixData = await convertAddressToMatrixMemberData(baseMember.middleChildUser, provider);
            await sleep(1000);
            members = members.concat(await getUserMatrixData(middleChildMatrixData, provider, level + 1));
        }

        if (baseMember.rightChildUser) {
            const rightChildMatrixData = await convertAddressToMatrixMemberData(baseMember.rightChildUser, provider);
            await sleep(1000);
            members = members.concat(await getUserMatrixData(rightChildMatrixData, provider, level + 1));
        }
    }

    console.log(`Completed fetching matrix data for member ${baseMember.username} at level ${level}`);
    return members;
};

const getUserDirectSponsorsMatrices = async (
    baseMember: MatrixMemberData,
    provider: NetworkProvider,
): Promise<MatrixMemberData[][]> => {
    const baseMemberContract = provider.open(await HypersonicUserContract.fromInit(baseMember.walletAddress));

    const baseMemberDirectSponsors = (await baseMemberContract.getInvited()).mapping.values();

    let directSponsorsMatricesData: MatrixMemberData[][] = [];

    const sponsorPromises = Array.from(baseMemberDirectSponsors).map(async (directSponsor: any) => {
        const directSponsorContract = provider.open(await HypersonicUserContract.fromInit(directSponsor));

        const directSponsorMatrixRegistrationDate = await directSponsorContract.getMatrixRegistrationDate();
        if (directSponsorMatrixRegistrationDate) {
            const directSponsorMatrixSubscriptionData = await directSponsorContract.getMatrixUserData();

            if (directSponsorMatrixSubscriptionData.matrixSubscriptionType != null) {
                const directSponsorData = await convertAddressToMatrixMemberData(directSponsor, provider);
                const directSponsorMatrixData = await getUserMatrixData(directSponsorData, provider);
                directSponsorsMatricesData.push(
                    directSponsorMatrixData.filter(
                        (member: any) => member.walletAddress !== directSponsorData.walletAddress,
                    ),
                );
            }
        }
        await sleep(1000);
    });

    await Promise.all(sponsorPromises);

    console.log('directSponsorsMatricesData:', directSponsorsMatricesData);

    return directSponsorsMatricesData.filter((matrix) => matrix.length > 0);
};

const getUser2ndGenSponsorsMatrices = async (
    baseMember: MatrixMemberData,
    provider: NetworkProvider,
): Promise<MatrixMemberData[][]> => {
    const baseMemberContract = provider.open(await HypersonicUserContract.fromInit(baseMember.walletAddress));

    const baseMemberDirectSponsors = (await baseMemberContract.getInvited()).mapping.values();

    let secondGenSponsorsMatricesData: MatrixMemberData[][] = [];

    const sponsorPromises = Array.from(baseMemberDirectSponsors).map(async (directSponsor: any) => {
        const directSponsorContract = provider.open(await HypersonicUserContract.fromInit(directSponsor));

        const directSponsorMatrixRegistrationDate = await directSponsorContract.getMatrixRegistrationDate();

        if (directSponsorMatrixRegistrationDate) {
            const directSponsorMatrixSubscriptionData = await directSponsorContract.getMatrixUserData();

            if (directSponsorMatrixSubscriptionData.matrixSubscriptionType != null) {
                const directSponsorData = await convertAddressToMatrixMemberData(directSponsor, provider);
                const directSponsorDirectSponsors = (
                    await provider
                        .open(await HypersonicUserContract.fromInit(directSponsorData.walletAddress))
                        .getInvited()
                ).mapping.values();

                const secondGenSponsorPromises = Array.from(directSponsorDirectSponsors).map(
                    async (secondGenSponsor: any) => {
                        const secondGenSponsorContract = provider.open(
                            await HypersonicUserContract.fromInit(secondGenSponsor),
                        );

                        const secondGenSponsorMatrixRegistrationDate =
                            await secondGenSponsorContract.getMatrixRegistrationDate();

                        if (secondGenSponsorMatrixRegistrationDate) {
                            const secondGenSponsorMatrixSubscriptionData =
                                await secondGenSponsorContract.getMatrixUserData();

                            if (secondGenSponsorMatrixSubscriptionData.matrixSubscriptionType != null) {
                                const secondGenSponsorData = await convertAddressToMatrixMemberData(
                                    secondGenSponsor,
                                    provider,
                                );
                                const secondGenSponsorMatrixData = await getUserMatrixData(
                                    secondGenSponsorData,
                                    provider,
                                );
                                secondGenSponsorsMatricesData.push(
                                    secondGenSponsorMatrixData.filter(
                                        (member: any) => member.walletAddress !== secondGenSponsorData.walletAddress,
                                    ),
                                );
                            }
                        }
                        await sleep(1000);
                    },
                );

                await Promise.all(secondGenSponsorPromises);
            }
        }
    });

    await Promise.all(sponsorPromises);

    console.log('secondGenSponsorsMatricesData:', secondGenSponsorsMatricesData);

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

    if (totalCompanyRevenue < 0) {
        totalCompanyRevenue = 0;
    }

    return {
        username: targetMember.username,
        walletAddress: targetMember.walletAddress,
        memberRevenue: totalMemberRevenue,
        companyRevenue: totalCompanyRevenue,
        subscriptionFee,
    };
};

export async function run(provider: NetworkProvider) {
    try {
        const hypersonicMainContract = provider.open(
            await HypersonicMainContract.fromInit(
                Address.parse(process.env.COMPANY_WALLET_ADDRESS!),
                process.env.CONTRACT_KEY!,
            ),
        );

        let users = await UserService.getUsers();

        // const startIndex = users.findIndex((user: any) => user.username === 'legacymaker');
        // const slicedUsers = users.slice(startIndex);

        // users = slicedUsers;

        // console.log(users);

        const monthlyDistributions: Dictionary<bigint, MonthlyDistribution> = Dictionary.empty();
        const distributionList = [];
        for (let i = 0; i < users.length; i++) {
            try {
                const user = users[i];

                console.log(`\nProcessing ${user.username}...`);

                const userContract = provider.open(
                    await HypersonicUserContract.fromInit(Address.parse(user.walletAddress)),
                );
                console.log('=======>>>>> 1');
                const matrixRegistrationDate = await userContract.getMatrixRegistrationDate();
                console.log('=======>>>>> 2');
                if (matrixRegistrationDate) {
                    const matrixUserData = await convertAddressToMatrixMemberData(
                        Address.parse(user.walletAddress),
                        provider,
                    );
                    console.log('=======>>>>> 3');
                    if (matrixUserData.matrixSubscriptionType != null) {
                        console.log('======================================');
                        console.log('---------> Balance before:', fromNano(await userContract.getUserBalance()));

                        const userMatrixData = await convertAddressToMatrixMemberData(
                            Address.parse(user.walletAddress),
                            provider,
                        );
                        console.log('---------> Getting user matrix data...');
                        const userMatrixArray = await getUserMatrixData(userMatrixData, provider);
                        console.log(
                            '---------> Getting user direct sponsors matrices and user 2nd gen sponsors matrices...',
                        );
                        const [userDirectSponsorsMatrices, user2ndGenSponsorsMatrices] = await Promise.all([
                            getUserDirectSponsorsMatrices(userMatrixData, provider),
                            getUser2ndGenSponsorsMatrices(userMatrixData, provider),
                        ]);

                        const userDistributionData = await calculateMatrixDistributionData(
                            userMatrixData,
                            userMatrixArray,
                            userDirectSponsorsMatrices,
                            user2ndGenSponsorsMatrices,
                        );

                        console.log(`---------> ${user.username}:`, userDistributionData);
                        distributionList.push({ packageLevel: userMatrixData.packageLevel, ...userDistributionData });

                        const userMonthlyDistributionResult = {
                            $$type: 'MonthlyDistribution' as const,
                            walletAddress: Address.parse(user.walletAddress),
                            memberRevenue: toNano(userDistributionData.memberRevenue),
                            companyRevenue: toNano(userDistributionData.companyRevenue),
                            subscriptionFee: toNano(userDistributionData.subscriptionFee),
                            contractKey: process.env.CONTRACT_KEY!,
                        };

                        console.log('\nRunning monthly distribution...');

                        const userMonthlyDistributions: Dictionary<bigint, MonthlyDistribution> = Dictionary.empty();
                        userMonthlyDistributions.set(1n, userMonthlyDistributionResult);

                        const monthlyDistributionListResult = await hypersonicMainContract.send(
                            provider.sender(),
                            {
                                value: toNano(0.25),
                            },
                            {
                                $$type: 'MonthlyDistributionList',
                                monthlyDistributions: userMonthlyDistributions,
                                numberOfDistributions: 1n,
                                contractKey: process.env.CONTRACT_KEY!,
                            },
                        );

                        console.log(`Distribution sent for ${user.username}`);
                        console.log('======================================');

                        // monthlyDistributions.set(BigInt(i + 1), userMonthlyDistributionResult);
                    } else {
                        console.log(`Skipping ${user.username}, user is not in the matrix.`);
                    }
                } else {
                    console.log(`Skipping ${user.username}, user is not in the matrix.`);
                }
            } catch (error) {
                console.log(error);
            }
        }

        console.log(`\nProcessing Company Position...`);

        const companyPositionWalletAddress = Address.parse(process.env.COMPANY_WALLET_ADDRESS!);

        const userContract = provider.open(await HypersonicUserContract.fromInit(companyPositionWalletAddress));
        const matrixRegistrationDate = await userContract.getMatrixRegistrationDate();
        if (matrixRegistrationDate) {
            const matrixUserData = await convertAddressToMatrixMemberData(companyPositionWalletAddress, provider);
            if (matrixUserData.matrixSubscriptionType != null) {
                console.log('======================================');
                console.log('Balance before:', fromNano(await userContract.getUserBalance()));

                const userMatrixData = await convertAddressToMatrixMemberData(companyPositionWalletAddress, provider);
                console.log('Getting user matrix data...');
                const userMatrixArray = await getUserMatrixData(userMatrixData, provider);
                console.log('Getting user direct sponsors matrices and user 2nd gen sponsors matrices...');
                const [userDirectSponsorsMatrices, user2ndGenSponsorsMatrices] = await Promise.all([
                    getUserDirectSponsorsMatrices(userMatrixData, provider),
                    getUser2ndGenSponsorsMatrices(userMatrixData, provider),
                ]);

                const userDistributionData = await calculateMatrixDistributionData(
                    userMatrixData,
                    userMatrixArray,
                    userDirectSponsorsMatrices,
                    user2ndGenSponsorsMatrices,
                );

                console.log(`Company Position:`, userDistributionData);

                const userMonthlyDistributionResult = {
                    $$type: 'MonthlyDistribution' as const,
                    walletAddress: companyPositionWalletAddress,
                    memberRevenue: toNano(userDistributionData.memberRevenue),
                    companyRevenue: toNano(userDistributionData.companyRevenue),
                    subscriptionFee: toNano(userDistributionData.subscriptionFee),
                    contractKey: process.env.CONTRACT_KEY!,
                };

                console.log('\nRunning monthly distribution...');

                const userMonthlyDistributions: Dictionary<bigint, MonthlyDistribution> = Dictionary.empty();
                userMonthlyDistributions.set(1n, userMonthlyDistributionResult);

                const monthlyDistributionListResult = await hypersonicMainContract.send(
                    provider.sender(),
                    {
                        value: toNano(0.25),
                    },
                    {
                        $$type: 'MonthlyDistributionList',
                        monthlyDistributions: userMonthlyDistributions,
                        numberOfDistributions: 1n,
                        contractKey: process.env.CONTRACT_KEY!,
                    },
                );

                console.log(`Distribution sent for Company Position`);
                console.log('======================================');
            } else {
                console.log(`Skipping Company Position, user is not in the matrix.`);
            }
        } else {
            console.log(`Skipping Company Position, user is not in the matrix.`);
        }

        // console.log(monthlyDistributions.values());

        // console.log('\nNumber of distributions:', monthlyDistributions.values().length);
        // console.log('\nTotal Cost in TON:', fromNano(toNano(0.25) * BigInt(monthlyDistributions.values().length)));

        // console.log('\nRunning monthly distribution...');

        // const monthlyDistributionListResult = await hypersonicMainContract.send(
        //     provider.sender(),
        //     {
        //         value: toNano(0.25) * BigInt(monthlyDistributions.values().length),
        //     },
        //     {
        //         $$type: 'MonthlyDistributionList',
        //         monthlyDistributions: monthlyDistributions,
        //         numberOfDistributions: BigInt(monthlyDistributions.values().length),
        //         contractKey: process.env.CONTRACT_KEY!,
        //     },
        // );
        
        console.log('*******************************************************');
        const csvWriter = createCsvWriter({
            path: 'MonthlyDistribution.csv',
            header: [
                { id: 'username', title: 'username' },
                { id: 'walletAddress', title: 'walletAddress' },
                { id: 'packageLevel', title: 'packageLevel' },
                { id: 'memberRevenue', title: 'memberRevenue' },
                { id: 'companyRevenue', title: 'companyRevenue' },
                { id: 'subscriptionFee', title: 'subscriptionFee' },
            ],
        });
        await csvWriter.writeRecords(distributionList).then(() => {
            console.log('CSV file was written successfully');
        });
        console.log('\nMonthly distribution successful!');
        console.log('*******************************************************');
    } catch (error) {
        console.log('error');
    }
}
function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
