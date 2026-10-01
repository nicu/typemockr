import { ProductBase } from '../ProductBase';
import { StockStatus } from './StockStatus';
export declare class BookProduct extends ProductBase {
    static $type: string;
    author: string;
    publishedOn: Date;
    status: StockStatus;
}
