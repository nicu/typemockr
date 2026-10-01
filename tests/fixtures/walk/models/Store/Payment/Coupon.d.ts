import { PaymentBase } from './PaymentBase';
export declare class Coupon extends PaymentBase {
    static $type: string;
    serialNumber: string;
    code: string;
}
