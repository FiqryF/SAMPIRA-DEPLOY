// Read-only integration check. Start the local Go server and apply the category migration first.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';

const {wasteCategories: categories} = createRequire(import.meta.url)('../assets/js/waste-categories.js');
assert.equal(categories.length, 10);
assert.equal(new Set(categories.map(category => category.name)).size, categories.length);
const expected = {'Organik': [0, 0], 'Plastik PET': [3000, 0], 'Kertas dan Kardus': [1000, 0], 'Besi': [2500, 0], 'Kaca': [150, 0], 'Small Gadgets': [5000, 500], 'Computers': [7000, 1000], 'Large Appliances': [10000, 5000], 'Batteries': [3000, 2000], 'B3 Rumah Tangga': [0, 0]};
async function checkCategory(category) {
    assert.deepEqual([category.rate, category.feePerKg], expected[category.name]);
    const response = await fetch('http://localhost:8080/api/ecorecycle/estimate_reward', {
        method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({category: category.name, weight_kg: 2.5})
    });
    assert.equal(response.status, 200, category.name);
    const {data} = await response.json();
    assert.equal(data.category, category.name);
    assert.equal(data.reward_rate, category.rate);
    assert.equal(data.total_estimate, category.rate * 2.5);
    assert.equal(data.processing_fee, category.feePerKg * 2.5);
    assert.equal(data.net_estimate, (category.rate - category.feePerKg) * 2.5);
}
async function checkUnknownCategory(name) {
    const response = await fetch('http://localhost:8080/api/ecorecycle/estimate_reward', {
        method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({category: name, weight_kg: 2})
    });
    assert.equal(response.status, 400, `Must reject incomplete/unknown category: ${name}`);
}
await Promise.all(categories.map(checkCategory));
await Promise.all(['Anorganik', 'Organ', 'Gadgets', 'Kategori tidak ada', '%'].map(checkUnknownCategory));
console.log('PASS: 10 category tariffs match the database, net rewards are correct, and 5 invalid categories are rejected.');
