export default {
  values: {
    "Customer.name": '"Ada Lovelace"',
    "Order.status": '"declined"',
    "Order.note": '"Leave at the door"',
  },
  rules: {
    Order: [
      'if (overrides.note === undefined && result.status === "declined") {',
      '  result.note = "Payment declined";',
      "}",
    ],
  },
};
