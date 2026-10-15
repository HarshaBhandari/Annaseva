const XLSX = require("xlsx");
const path = require("path");

const firstNames = [
  "Aarav","Vivaan","Aditya","Vihaan","Arjun","Sai","Ishaan","Atharv","Om",
  "Rohan","Rahul","Sanket","Akash","Nikhil","Siddharth","Pranav","Kunal",
  "Sagar","Amol","Tejas","Ananya","Aditi","Saanvi","Ira","Riya","Pooja",
  "Priya","Sneha","Neha","Kavya","Isha","Shruti","Mrunal","Sayali","Gauri",
  "Vaishnavi","Pallavi","Komal","Tanvi","Madhura","Swara","Diya","Meera",
  "Nisha","Rekha","Sunita","Kiran","Ashwini","Manasi","Rutuja"
];

const surnames = [
  "Patil","Shinde","Jadhav","Pawar","More","Deshmukh","Kadam","Chavan",
  "Gaikwad","Bhosale","Kulkarni","Joshi","Mali","Wagh","Salunkhe"
];

const relationships = ["Spouse","Son","Daughter","Father","Mother","Brother","Sister"];
const categories = ["Yellow","Orange","White"];
const beneficiaries = [];
const familyMembers = [];

for (let i = 0; i < 50; i++) {
  const code = `DEMO-BEN-${String(i + 1).padStart(4, "0")}`;
  const fullName = `${firstNames[i]} ${surnames[i % surnames.length]}`;
  const familySize = 2 + (i % 5);

  beneficiaries.push({
    beneficiary_code: code,
    full_name: fullName,
    email: `beneficiary${String(i + 1).padStart(3, "0")}@example.com`,
    mobile_number: `000000${String(i + 1).padStart(4, "0")}`,
    ration_card_number: `DEMO-RC-${String(i + 1).padStart(4, "0")}`,
    card_category: categories[i % categories.length],
    family_size: familySize,
    fps_shop_code: "FPS-1002"
  });

  for (let j = 1; j < familySize; j++) {
    const memberName =
      `${firstNames[(i + j * 7) % firstNames.length]} ` +
      `${surnames[(i + j) % surnames.length]}`;

    familyMembers.push({
      beneficiary_code: code,
      member_name: memberName,
      relationship: relationships[(j - 1) % relationships.length]
    });
  }
}

const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(
  wb, XLSX.utils.json_to_sheet(beneficiaries), "Beneficiaries"
);
XLSX.utils.book_append_sheet(
  wb, XLSX.utils.json_to_sheet(familyMembers), "FamilyMembers"
);

const output = path.join(process.cwd(), "Annaseva_Beneficiary_Data.xlsx");
XLSX.writeFile(wb, output);
console.log(`Created: ${output}`);
console.log(`Beneficiary households: ${beneficiaries.length}`);
console.log(`Additional family members: ${familyMembers.length}`);
console.log("Demo FPS shop: FPS-1002");
