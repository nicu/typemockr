import { ProductBase } from '../ProductBase';
import { Edition } from './Edition';
import { PolicyKind } from './PolicyKind';
import { ContentBase } from '../ContentBase';
import { PaymentBase } from '../Payment/PaymentBase';
export declare class DetailsResponse {
    static $type: string;
    product: ProductBase;
    editions: Edition[];
    note?: string;
    alt: string | null;
    payload: any;
    updatedAt: Date;
    history: Date[];
    policies?: {
        [key in PolicyKind]: string;
    };
    flags?: Record<"a" | "b", boolean>;
    partial?: Partial<Edition>;
    payments?: PaymentBase[];
    content?: ContentBase;
}
