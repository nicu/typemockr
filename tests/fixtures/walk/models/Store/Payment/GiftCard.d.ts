import { PaymentBase } from './PaymentBase';
export declare class GiftCard extends PaymentBase {
    static $type: string;
    serialNumber: string;
    restrictions: {
        [key: string]: string;
    };
}
