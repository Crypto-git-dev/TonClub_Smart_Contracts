import { Address, fromNano, toNano, beginCell } from '@ton/core';
import { NetworkProvider } from '@ton/blueprint';
import { NftItem } from '../build/TonClubNFT/tact_NftItem';

export async function run(provider: NetworkProvider, args: string[]) {
    const nftItem = provider.open(
        await NftItem.fromAddress(Address.parse("kQCowp8z0y_Iss6f4FZf334RbrTZs_oRUYlBGbZYVxFQkXQf")), // NOTE: Change to the address of the main contract you want to check
    );
    
    const content = await nftItem.getGetNftData();
    console.log('Collection DAta: ', content);

}
