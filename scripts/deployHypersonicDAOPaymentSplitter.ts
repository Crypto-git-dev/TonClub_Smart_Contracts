import { Address, toNano } from '@ton/core';
import { HypersonicDAOPaymentSplitter } from '../wrappers/HypersonicDAOPaymentSplitter';
import { NetworkProvider } from '@ton/blueprint';

export async function run(provider: NetworkProvider) {
    const hypersonicDAOPaymentSplitter = provider.open(await HypersonicDAOPaymentSplitter.fromInit(
        Address.parse(process.env.SPLITTER_WALLET_1!),
        Address.parse(process.env.SPLITTER_WALLET_2!),
        Address.parse(process.env.SPLITTER_WALLET_3!),
        Address.parse(process.env.EXPENSES_WALLET!),
    ));

    await hypersonicDAOPaymentSplitter.send(
        provider.sender(),
        {
            value: toNano('0.05'),
        },
        {
            $$type: 'Deploy',
            queryId: 0n,
        }
    );

    await provider.waitForDeploy(hypersonicDAOPaymentSplitter.address);

    // run methods on `hypersonicDAOPaymentSplitter`
}
