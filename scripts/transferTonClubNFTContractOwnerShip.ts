import { Address, toNano } from '@ton/core';
import { NftCollection } from '../wrappers/TonClubNFT';
import { NetworkProvider } from '@ton/blueprint';

export async function run(provider: NetworkProvider, args: string[]) {
    const nftCollection = provider.open(
        await NftCollection.fromAddress(Address.parse(process.env.NFT_COLLECTION_ADDRESS!)), // NOTE: Change to the address of the main contract you want to check
    );

    const contractOwnerBefore = await nftCollection.getOwner();
    const ownerAddress = contractOwnerBefore.toString();
    console.log('Current Contract Owner :', ownerAddress);
    if (ownerAddress === provider.sender().address?.toString()) {
        const ui = provider.ui();
        const newOwnerAdress = Address.parse(
            args.length > 0 ? args[0] : await ui.input('Input New Owner Wallet address'),
        );
        await nftCollection.send(
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
