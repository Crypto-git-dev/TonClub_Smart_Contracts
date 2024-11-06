import { Address, fromNano, toNano } from '@ton/core';
import { HypersonicMainContract } from '../wrappers/HypersonicMainContract';
import { NetworkProvider } from '@ton/blueprint';

export async function run(provider: NetworkProvider) {
    const hypersonicMainContract = provider.open(
        await HypersonicMainContract.fromAddress(Address.parse('EQBCDqkqCQqFO8uRIySyxOQ4WEu3Ag_GIxlXFo3CReM8x-qE')), // NOTE: Change to the address of the main contract you want to check
    );

    const contractBalanceBefore = await hypersonicMainContract.getBalance();
    console.log('Contract balance before:', fromNano(contractBalanceBefore));

    const withdrawalAmount = toNano('5');

    const adminWithdrawalResult = await hypersonicMainContract.send(
        provider.sender(),
        {
            value: toNano('0.25'),
        },
        {
            $$type: 'AdminWithdrawal',
            amount: withdrawalAmount,
            contractKey: process.env.CONTRACT_KEY!,
        },
    );
}
