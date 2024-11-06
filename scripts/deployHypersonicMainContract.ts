import { Address, Dictionary, toNano } from '@ton/core';
import { HypersonicMainContract } from '../wrappers/HypersonicMainContract';
import { NetworkProvider } from '@ton/blueprint';
import { MatrixPosition, SubscriptionType } from '../data/data-structures';

export async function run(provider: NetworkProvider) {
    // Ensure the environment variables are set
    const companyWalletAddress = process.env.COMPANY_WALLET_ADDRESS;
    const contractKey = process.env.CONTRACT_KEY;

    if (!companyWalletAddress || !contractKey) {
        throw new Error("Environment variables COMPANY_WALLET_ADDRESS and CONTRACT_KEY must be set.");
    }

    const hypersonicMainContract = provider.open(
        await HypersonicMainContract.fromInit(
            // Address.parse(companyWalletAddress),
            Address.parse("0QB-wPAr-HndciOgS5eWGFWfNhZ6VzBgt8rahDCj1_wS2DZc"),
            contractKey,
        ),
    );

    await hypersonicMainContract.send(
        provider.sender(),
        {
            value: toNano('1'),
        },
        {
            $$type: 'Deploy',
            queryId: BigInt(new Date().getTime()),
        },
    );

    await provider.waitForDeploy(hypersonicMainContract.address);

    // Initialize the uplineMapping
    const uplineMapping: Dictionary<bigint, Address> = Dictionary.empty();

    const preRegisterData = {
        walletAddress: Address.parse(companyWalletAddress),
        username: 'Hypersonic_2x_DAO',
        upline: {
            $$type: 'Upline' as const,
            mapping: uplineMapping,
            count: BigInt(uplineMapping.values().length), // This will be 0 initially
        },
        packageLevel: 7n,
        matrixParentUser: null,
        matrixPosition: MatrixPosition.Left,
        subscriptionType: SubscriptionType.MonthlyWithin30Days,
        contractKey: contractKey,
    };

    const preRegisterResult = await hypersonicMainContract.send(
        provider.sender(),
        {
            value: toNano('0.7'),
        },
        {
            $$type: 'PreRegisterMember',
            ...preRegisterData,
        },
    );

    // run methods on `hypersonicMainContract`
}