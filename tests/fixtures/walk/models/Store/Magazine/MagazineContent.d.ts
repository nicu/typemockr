import { ContentBase } from '../ContentBase';
import { EditionKind } from '../EditionKind';
import { Edition } from '../Book/Edition';
export declare class MagazineContent extends ContentBase {
    backIssues: Edition[];
    format: EditionKind;
    rating: number | null;
    launchedOn: Date;
    digital: boolean;
    publisherName?: string;
}
