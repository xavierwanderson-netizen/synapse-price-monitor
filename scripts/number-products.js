import fs from "fs";

const PRODUCTS_FILE = "./products.json";

function main() {
  const raw = fs.readFileSync(PRODUCTS_FILE, "utf-8");
  const products = JSON.parse(raw);

  if (!Array.isArray(products)) {
    throw new Error("products.json precisa ser um array.");
  }

  const numbered = products.map((product, index) => ({
    seq: index + 1,
    ...product,
  }));

  fs.writeFileSync(PRODUCTS_FILE, `${JSON.stringify(numbered, null, 2)}\n`);
  console.log(`✅ products.json numerado com ${numbered.length} itens (campo 'seq').`);
}

main();
