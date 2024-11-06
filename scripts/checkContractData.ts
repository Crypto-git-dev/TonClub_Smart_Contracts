import { Address, fromNano } from '@ton/core';
import { HypersonicMainContract } from '../wrappers/HypersonicMainContract';
import { NetworkProvider } from '@ton/blueprint';
import { HypersonicUserContract } from '../build/HypersonicMainContract/tact_HypersonicUserContract';
export async function run(provider: NetworkProvider) {
    const hypersonicMainContract = provider.open(
        await HypersonicMainContract.fromAddress(Address.parse('EQBCDqkqCQqFO8uRIySyxOQ4WEu3Ag_GIxlXFo3CReM8x-qE')), // NOTE: Change to the address of the main contract you want to check
        // await HypersonicMainContract.fromAddress(Address.parse("EQD07QjgRY_Yv0XrwUG8WOE0uktM5dEo7c0iuXcKS1Lf8GWj"))
    );

    const [startDateBigInt, balance, numberOfUsers, companyWalletAddress, owner] = await Promise.all([
        hypersonicMainContract.getStartDate(),
        hypersonicMainContract.getBalance(),
        hypersonicMainContract.getNumberOfUsers(),
        hypersonicMainContract.getCompanyUniLevelUserAddress(),
        hypersonicMainContract.getOwner()
    ]);
    const startDate = new Date(Number(startDateBigInt) * 1000).toLocaleString();

    console.log('Start date:', startDate);
    console.log('Main contract TON balance', fromNano(balance));
    console.log('Number of users:', numberOfUsers);
    console.log('Company Unilevel Contract Address:', companyWalletAddress);
    console.log('Owner:', owner);
    const companyUserContract = provider.open(
        await HypersonicUserContract.fromInit(Address.parse(process.env.COMPANY_WALLET_ADDRESS!)),
        // await HypersonicUserContract.fromAddress(Address.parse("EQDSRhoY72Yw2zVT4Ij0uAu6nsoFDstZ6nLLRojdBkcUvUgm")),
    );
    const [companyUnilevelData, companyMatrixData] = await Promise.all([
        companyUserContract.getUniLevelUserData(),
        companyUserContract.getMatrixUserData()
    ]);

    console.log('Company Unilevel Data:');
    console.log(companyUnilevelData);
    console.log('\nCompany Matrix Data:');
    console.log(companyMatrixData);
    // run methods on `hypersonicMainContract`
}
