import { Address, Dictionary } from "@ton/core";
import { Payout } from "../wrappers/HypersonicMainContract";

export enum SubscriptionType {
    YearlyWithin30Days = 'yearly-within-30-days',
    YearlyAfter30Days = 'yearly-after-30-days',
    MonthlyWithin30Days = 'monthly-within-30-days',
    MonthlyAfter30Days = 'monthly-after-30-days',
}

export enum SubscriptionPrices {
    YearlyWithin30Days = 40,
    YearlyAfter30Days = 80,
    MonthlyWithin30Days = 5,
    MonthlyAfter30Days = 10,
}

export enum MatrixPosition {
    Left = 'left',
    Middle = 'middle',
    Right = 'right',
}

export enum PackageLevelPrices {
    Level1 = 3,
    Level2 = 15,
    Level3 = 60,
    Level4 = 120,
    Level5 = 240,
    Level6 = 400,
    Level7 = 600,
}

export enum PackageLevelPayoutPercentages {
    Level1 = 10,
    Level2 = 20,
    Level3 = 20,
    Level4 = 10,
    Level5 = 10,
    Level6 = 10,
    Level7 = 10,
}

export type UnilevelMemberData = {
    username: string;
    walletAddress: Address;
    uplinesPackageLevels: number[];
    uplineAddresses: Address[];
    packageLevel: number;
};

export type Position = {
    parent: Address;
    position: MatrixPosition;
};

export type MatrixMemberPositionData = {
    address: Address;
    leftChild: MatrixMemberPositionData | null;
    middleChild: MatrixMemberPositionData | null;
    rightChild: MatrixMemberPositionData | null;
    children: MatrixMemberPositionData[];
};

export type MatrixMemberData = {
    username: String;
    walletAddress: Address;
    packageLevel: number;
    matrixRegistrationDate: Date | null;
    matrixExpirationDate: Date | null;
    matrixSubscriptionType: SubscriptionType;
    parentUser: Address | null;
    leftChildUser: Address | null;
    middleChildUser: Address | null;
    rightChildUser: Address | null;
    matrixSubscriptionActive: boolean;
    matrixSubscriptionGracePeriodActive: boolean;
};

export type MatrixMonthlyDistributionData = {
    username: String;
    walletAddress: Address;
    memberRevenue: number;
    companyRevenue: number;
    subscriptionFee: number;
};

export type UnilevelPackageDistributionData = {
    username: String;
    walletAddress: Address;
    targetPackageLevel: number;
    targetPackageLevelPrice: number;
    payouts: Dictionary<bigint, Payout>;
};