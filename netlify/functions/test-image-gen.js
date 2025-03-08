const fs = require('fs');
const path = require('path');
const { generateImage } = require('./generate-image');

const TEST_MESSAGES = [
  "Satshriakal bai sab nu Bai apa room rent te de rahe basement private room,\nkitchen,\nbathroom,\nlaundry all available in just 600$/month. Je kise nu chahida hoya dsseo jrur. Room near inkster road te aa just back to kalgidhar gurudwara sahib.  Dhanwad jii",
  "Hii.mai ikk feeling share krna chaundi aa.eh unaa lyi aa jehre north location de walmart ch kmm krde. Hint- tattoo of last name😉. Mai tuhanu kaafi time toh notice kr rhi aa.products pushn de bahane gall v kiti. Par tuhade toh push ni ski. Pls eh post like krdo. I will reach out.",
  "Available  From March 10 . Only For Girls. Hi i have private fully Furnished room on main floor.It has seprate washroom,\nshared kitchen. Its pretty close to University of Manitoba,\nMITT College just walking distance to Shopper's Superstore,\nPizza Pizza,\nGill SuperMarket,\nTim Horton's,\n....\n                    Mcdonald's and all other stores as well as walking distance for bus stop.Text me at 2049515143Thanks",
  "I was looking to connect with someone who works at ashley furn. I really needed a reference. I have tons of experience in school but I need to work particularly there due to my personal reasons. I currently work at people's jewellers. I will pay too please reach out. God will bless you for helping this poor girl out."
];

const TEST_CASES = TEST_MESSAGES.map((message, index) => ({
  name: `message-${String(index + 1).padStart(2, '0')}`,
  params: {
    text: message,
    postId: `MSG${String(index + 1).padStart(3, '0')}`,
    time: "12:00 PM"
  }
}));

async function runTests() {
  const outputDir = path.join(__dirname, 'test-outputs');
  
  // Create output directory if it doesn't exist
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  let successCount = 0;
  let failureCount = 0;

  for (const testCase of TEST_CASES) {
    try {
      console.log(`🏁 Running test: ${testCase.name}`);
      
      const result = await generateImage(
        testCase.params.text,
        testCase.params.postId,
        testCase.params.time
      );

      if (result.error) {
        throw new Error(result.error);
      }

      const outputPath = path.join(outputDir, `${testCase.name}.png`);
      fs.writeFileSync(outputPath, Buffer.from(result.image, 'base64'));
      
      console.log(`✅ ${testCase.name} succeeded`);
      successCount++;
    } catch (error) {
      console.error(`❌ ${testCase.name} failed:`, error.message);
      failureCount++;
    }
  }

  console.log('\nTest Summary:');
  console.log(`✅ ${successCount} successful`);
  console.log(`❌ ${failureCount} failed`);
  console.log(`📁 Outputs saved to: ${outputDir}`);

  if (failureCount > 0) {
    process.exit(1);
  }
}

runTests();