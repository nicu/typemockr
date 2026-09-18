import { MockApiAdminGiftCard } from "../$mock/api/Admin/GiftCard.mock";
import { MockApiMoney } from "../$mock/api/index.mock";
import { MockApiStoreGiftCard } from "../$mock/api/Store/GiftCard.mock";
import { MockGiftCard } from "../$mock/local/models.mock";

export const all = {
  local: MockGiftCard(),
  store: MockApiStoreGiftCard(),
  admin: MockApiAdminGiftCard(),
  money: MockApiMoney(),
};
