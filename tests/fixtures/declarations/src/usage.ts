import { MockApiAdminCertificate } from "../$mock/api/Admin/Certificate.mock";
import { MockApiMoney } from "../$mock/api/index.mock";
import { MockApiSalesCertificate } from "../$mock/api/Sales/Certificate.mock";
import { MockCertificate } from "../$mock/local/models.mock";

export const all = {
  local: MockCertificate(),
  sales: MockApiSalesCertificate(),
  admin: MockApiAdminCertificate(),
  money: MockApiMoney(),
};
