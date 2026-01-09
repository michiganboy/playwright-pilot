/**
 * Suggests faker methods based on field type and name.
 */
export function suggestFakerMethod(fieldName: string, fieldType: string): string {
  const lowerName = fieldName.toLowerCase();

  switch (fieldType) {
    case "string":
      if (lowerName.includes("email")) return "faker.internet.email()";
      if (lowerName.includes("phone")) return "faker.phone.number()";
      if (lowerName.includes("firstname") || lowerName === "firstname") return "faker.person.firstName()";
      if (lowerName.includes("lastname") || lowerName === "lastname") return "faker.person.lastName()";
      if (lowerName.includes("name") || lowerName.includes("fullname")) return "faker.person.fullName()";
      if (lowerName.includes("id") || lowerName.includes("uuid")) return "faker.string.uuid()";
      if (lowerName.includes("address")) return "faker.location.streetAddress()";
      if (lowerName.includes("city")) return "faker.location.city()";
      if (lowerName.includes("state")) return "faker.location.state()";
      if (lowerName.includes("zip") || lowerName.includes("postal")) return "faker.location.zipCode()";
      if (lowerName.includes("country")) return "faker.location.country()";
      if (lowerName.includes("url") || lowerName.includes("website")) return "faker.internet.url()";
      if (lowerName.includes("password")) return "faker.internet.password()";
      if (lowerName.includes("username")) return "faker.internet.userName()";
      return "faker.lorem.word()";

    case "number":
      if (lowerName.includes("id")) return "faker.number.int({ min: 1, max: 1000 })";
      if (lowerName.includes("age")) return "faker.number.int({ min: 18, max: 100 })";
      if (lowerName.includes("price") || lowerName.includes("cost") || lowerName.includes("amount")) {
        return "faker.number.float({ min: 0, max: 1000, fractionDigits: 2 })";
      }
      if (lowerName.includes("count") || lowerName.includes("quantity")) return "faker.number.int({ min: 1, max: 100 })";
      return "faker.number.int()";

    case "boolean":
      return "faker.datatype.boolean()";

    case "Date":
      if (lowerName.includes("start") || lowerName.includes("begin")) return "faker.date.future()";
      if (lowerName.includes("end") || lowerName.includes("expire") || lowerName.includes("expiry")) {
        return "faker.date.future()";
      }
      if (lowerName.includes("created") || lowerName.includes("updated")) return "faker.date.recent()";
      if (lowerName.includes("birth") || lowerName.includes("past")) return "faker.date.past()";
      return "faker.date.anytime()";

    default:
      return "faker.lorem.word()";
  }
}

/**
 * Gets available field types for selection.
 */
export function getFieldTypes(): Array<{ value: string; name: string }> {
  return [
    { value: "string", name: "string" },
    { value: "number", name: "number" },
    { value: "boolean", name: "boolean" },
    { value: "Date", name: "Date" },
  ];
}
