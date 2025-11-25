const mongoose = require('mongoose');

async function run() {
  console.log('Setting up game patterns configuration...');
  
  const patterns = [
    {
      name: 'line',
      displayName: 'Row or Column',
      description: 'Complete one entire row or column',
      patterns: [
        'Complete horizontal line (any row)',
        'Complete vertical line (any column)'
      ]
    },
    {
      name: 'diagonal',
      displayName: 'Diagonal',
      description: 'Complete one diagonal line',
      patterns: [
        'Top-left to bottom-right diagonal',
        'Top-right to bottom-left diagonal'
      ]
    },
    {
      name: 'four_corners',
      displayName: 'Four Corners',
      description: 'Mark all four corner cells',
      patterns: [
        'Top-left, top-right, bottom-left, bottom-right'
      ]
    }
  ];

  console.log('✅ Game patterns configured:');
  patterns.forEach(pattern => {
    console.log(`   📊 ${pattern.displayName}: ${pattern.description}`);
  });

  // Create a configuration collection if needed
  const db = mongoose.connection.db;
  const collections = await db.listCollections({ name: 'configurations' }).toArray();
  if (collections.length === 0) {
    await db.createCollection('configurations');
  }

  // Save patterns to configurations collection
  await db.collection('configurations').updateOne(
    { key: 'winning_patterns' },
    { 
      $set: {
        key: 'winning_patterns',
        value: patterns,
        updatedAt: new Date()
      }
    },
    { upsert: true }
  );

  console.log('✅ Winning patterns saved to database configuration');
}

module.exports = {
  name: 'gamePatterns',
  run
};
