import { CardStatus } from './CardStatus';
import { Money } from '../index';
declare enum Origin {
    Purchase = "Purchase",
    Gift = "Gift"
}
export declare class GiftCard {
    static $type: string;
    id: string;
    status: CardStatus;
    previousStatus?: CardStatus;
    openStatus: CardStatus.Active | CardStatus.Suspended;
    origin?: Origin;
    value: Money;
    issuedOn?: Date;
}
