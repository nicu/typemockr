export default {
  values: {
    "Person.name": '"Ada Lovelace"',
    "Order.status": '"error"',
    "Order.color": '"blue"',
  },
  rules: {
    Order: [
      'if (overrides.color === undefined && result.status === "error") {',
      '  result.color = "red";',
      "}",
    ],
  },
};
