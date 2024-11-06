import { Address, fromNano, toNano, beginCell } from '@ton/core';
import { NftCollection } from '../wrappers/TonClubNFT';
import { NetworkProvider } from '@ton/blueprint';

export async function run(provider: NetworkProvider, args: string[]) {
    const nftCollection = provider.open(
        await NftCollection.fromAddress(Address.parse(process.env.NFT_COLLECTION_ADDRESS!)), // NOTE: Change to the address of the main contract you want to check
    );
    const nft_index = 174n;

    const collectionData = await nftCollection.getGetCollectionData();
    const address_by_index = await nftCollection.getGetNftAddressByIndex(nft_index);
    const collection_content = await collectionData.collection_content.asSlice().loadStringTail();
    console.log('Collection DAta: ', collectionData);
    console.log('Collection Content :', collection_content);
    console.log('NFT ID[' + nft_index + ']: ' + address_by_index);

}
