import { Address, Dictionary, toNano } from '@ton/core';
import { HypersonicMainContract } from '../wrappers/HypersonicMainContract';
import { NetworkProvider } from '@ton/blueprint';
import { HypersonicUserContract } from '../build/HypersonicMainContract/tact_HypersonicUserContract';
import axios from 'axios';
import { prelaunchMembers } from '../data/prelaunch-members';

const AuthenticationServiceInstance = axios.create({
    baseURL: `https://tonclub.app/api/authentication`, // https://hypersonic2x.io/api-dev/authentication for dev, https://tonclub.app/api/authentication for prod
    headers: {
        'Content-Type': 'application/json',
        'API-Key': process.env.API_KEY!,
    },
});

const UserServiceInstance = axios.create({
    baseURL: `https://tonclub.app/api/users`, // https://hypersonic2x.io/api-dev/users for dev, https://tonclub.app/api/users for prod
    headers: {
        'Content-Type': 'application/json',
        'API-Key': process.env.API_KEY!,
    },
});

export class AuthenticationService {
    static async registerUser(userData: any) {
        return new Promise<any>((resolve, reject) => {
            const { email, fullName, username, profileImageUrl, walletAddress, inviter, country } = userData;

            let encodedUsername = encodeURIComponent(username);
            encodedUsername = encodedUsername.replace(/%20%20/g, '%20');
            AuthenticationServiceInstance.post(`/register`, {
                email,
                fullName,
                username: encodedUsername,
                profileImageUrl,
                walletAddress,
                inviter,
                country,
            })
                .then(
                    (response) => {
                        resolve(response.data);
                    },
                    (error) => {
                        reject(error);
                    },
                )
                .catch((error) => {
                    reject(error);
                });
        });
    }
}

export class UserService {
    static async getUsers() {
        const users = await UserServiceInstance.get('/');
        return users.data.data;
    }
}

export async function run(provider: NetworkProvider) {
    const hypersonicMainContract = provider.open(
        await HypersonicMainContract.fromAddress(Address.parse('EQBCDqkqCQqFO8uRIySyxOQ4WEu3Ag_GIxlXFo3CReM8x-qE')),
    );

    for (const member of prelaunchMembers) {
        const userContractAddress = await hypersonicMainContract.getUniLevelUserAddress(
            Address.parse(member.walletAddress),
        );
        const userContract = provider.open(await HypersonicUserContract.fromAddress(userContractAddress));

        try {
            const unilevelData = await userContract.getUniLevelUserData();

            console.log(`${member.username} exists. Proceeding to next member...`);
        } catch (error) {
            try {
                console.log(`Registering ${member.username}...`);

                await AuthenticationService.registerUser(member);

                console.log(`Registered ${member.username}.`);

                const uplineMapping: Dictionary<bigint, Address> = Dictionary.empty();
                for (let i = 0; i < member.upline.length; i++) {
                    uplineMapping.set(BigInt(i) + 1n, Address.parse(member.upline[i]));
                }

                const preRegisterData = {
                    walletAddress: Address.parse(member.walletAddress),
                    username: member.username,
                    upline: {
                        $$type: 'Upline' as const,
                        mapping: uplineMapping,
                        count: BigInt(uplineMapping.values().length),
                    },
                    packageLevel: member.packageLevel,
                    matrixParentUser: member.matrixParentUser ? Address.parse(member.matrixParentUser) : null,
                    matrixPosition: member.matrixPosition,
                    subscriptionType: member.subscriptionType,
                    contractKey: process.env.CONTRACT_KEY!,
                };

                const preRegisterResult = await hypersonicMainContract.send(
                    provider.sender(),
                    {
                        value: toNano('0.5'),
                    },
                    {
                        $$type: 'PreRegisterMember',
                        ...preRegisterData,
                    },
                );

                console.log('Pre-registered member: ', member.username);
            } catch (error) {
                console.log(`Error pre-registering member ${member.username}: `, error);
            }
        }
    }

    // run methods on `hypersonicMainContract`
}
