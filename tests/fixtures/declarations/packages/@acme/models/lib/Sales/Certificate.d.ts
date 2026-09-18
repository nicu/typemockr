import { MemberStatus } from './MemberStatus';
import { Money } from '../index';
declare enum Origin {
    Purchase = "Purchase",
    Gift = "Gift"
}
export declare class Certificate {
    static $type: string;
    id: string;
    status: MemberStatus;
    previousStatus?: MemberStatus;
    openStatus: MemberStatus.Active | MemberStatus.Suspended;
    origin?: Origin;
    value: Money;
    issuedOn?: Date;
}
