import { Address, toNano } from '@ton/core';
import { HypersonicMainContract } from '../wrappers/HypersonicMainContract';
import { NetworkProvider } from '@ton/blueprint';

export async function run(provider: NetworkProvider, args: string[]) {
    const hypersonicMainContract = provider.open(
        await HypersonicMainContract.fromAddress(Address.parse('EQDtFiNFeLssM4ViySjNrvuoOm4cU3ByoQZMhE2a4fvaYsSM')), // NOTE: Change to the address of the main contract you want to check
    );

    const contractOwnerBefore = await hypersonicMainContract.getOwner();
    const ownerAddress = contractOwnerBefore.toString();
    console.log('Contract Owner before:', ownerAddress);
    if (ownerAddress === provider.sender().address?.toString()) {
        const ui = provider.ui();
        const newOwnerAdress = Address.parse(
            args.length > 0 ? args[0] : await ui.input('Input New Owner Wallet address'),
        );
        await hypersonicMainContract.send(
            provider.sender(),
            {
                value: toNano('0.25'),
            },
            {
                $$type: 'ChangeOwner',
                queryId: BigInt(true),
                newOwner: newOwnerAdress,
            },
        );
        console.log('Contract Owner Chainged successfully');
    } else {
        console.log('you are not allowed');
    }
}
