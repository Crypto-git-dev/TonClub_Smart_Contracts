import { UserService } from './prePlaceMembers';
import { NetworkProvider } from '@ton/blueprint';
const fs = require('fs');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;
import { HypersonicUserContract } from '../build/HypersonicMainContract/tact_HypersonicUserContract';
import { Address, fromNano } from '@ton/core';

export async function run(provider: NetworkProvider) {
     let users = await UserService.getUsers();
    const walletList = users.map((val: any) => val.walletAddress);
    console.log(walletList);
    let realList: string[] = [];
    for (let i = 0; i < users.length; i++) {
        try {
            const user = users[i];
            const userContract = provider.open(
                await HypersonicUserContract.fromInit(Address.parse(user.walletAddress)),
            );
            const userInfo = await userContract.getUniLevelUserData();
            const invited = userInfo.invited.mapping.values();
            const data = invited.map((item) => item.toString());

            realList = [...realList, ...data];
            console.log(user.username + "invited list ===> ", data);
        } catch (error) {
            console.log(error);
        }
    }
    const result: string[] = reduceCount(realList);
    console.log(result);
    console.log(result.length);

}
function reduceCount(array: string[]): string[] {
  // Create an object to count occurrences of each item
  const itemCounts: { [key: string]: number } = {};
  const modifiedArray: string[] = [];
  const legal:string[] = [];
  // Count occurrences of each item
  array.forEach(item => {
      if(!modifiedArray.includes(item))
        modifiedArray.push(item);
      else
        legal.push(item);
  });
  return legal;
}