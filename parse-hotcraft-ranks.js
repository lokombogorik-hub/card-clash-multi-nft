const fs = require('fs');

const IPFS_BASE = "https://bafybeibqzbodfn3xczppxh2k2ek3bgvojhivqy4ntbkprcxesulth3yy5e.ipfs.w3s.link";
const TOTAL_NFTS = 2129;

// Данные о редкости трейтов из HotCraft
const TRAIT_RARITY = {
    "Background": {
        "Ancient ruins": 0.05, "Apocalypse": 0.05, "Aristocrat's house": 0.05, "Ashes": 0.05,
        "Autumn evening": 2.44, "Black Wall": 2.02, "Blue paints": 2.11, "Blue rings": 2.11,
        "City": 1.32, "City of Ashes": 1.74, "Cold morning": 1.74, "Country evening": 1.46,
        "Cracked ball": 1.97, "Crypt": 1.36, "Dark forest": 1.88, "Darkforest": 1.88,
        "Dragon spirit": 0.05, "Evening field": 2.02, "Evening light": 2.02, "Forest": 1.6,
        "Forest of Oblivion": 1.93, "Future": 0.05, "Gears": 1.88, "Ghost": 1.88,
        "Golden Radiance": 1.69, "Golden age": 1.64, "Graffiti wall": 0.05, "Green ball": 1.64,
        "Green wall": 1.5, "Laboratory": 1.64, "Lake shore": 1.97, "Lunar oblivion": 2.25,
        "Meteor shower": 1.55, "Midway park": 0.05, "Moon": 2.11, "Morning forest": 1.64,
        "Mountain beach": 1.78, "Near factory": 0.05, "Necromancer's Abode": 0.05,
        "Neon circle": 2.11, "Neon city": 1.83, "Neon diamond": 1.74, "Night": 1.6,
        "Night city": 0.05, "Night street": 1.55, "Night trail": 2.58, "Old castle": 0.05,
        "Olympus": 0.05, "Orange canvas": 1.93, "Overcast clouds": 1.74, "Paris": 1.88,
        "Pink bubbles": 2.11, "Pixel landscape": 1.64, "Purple style": 2.02, "Pyramid": 2.25,
        "Quiet Sun": 0.05, "Radiation": 1.55, "Reading room": 1.6, "Road forest": 1.46,
        "Room": 2.54, "Rotten Grove": 1.97, "Ruins": 1.36, "Slanting rain": 1.74,
        "Sorcerer Forest": 0.05, "Spring forest": 2.16, "Street Lanterns": 2.07,
        "Through the Twilight": 0.05, "Twilight": 1.83, "Vampire house": 0.05,
        "Winter forest": 1.6, "evening lights": 1.55,
    },
    "Body": {
        "Ash Whirlwind": 0.05, "Ash gray haze": 0.05, "Ashes of Time": 0.05, "Black": 9.53,
        "Blue": 9.3, "Bluish gray": 0.05, "Cloud smoke": 0.05, "Coal smoke": 0.05,
        "Cosmic reflection": 0.05, "Dusty obsidian": 0.05, "Gray": 9.91, "Grayish": 0.05,
        "Grey Stream": 0.05, "Infernal Violet": 0.05, "Light gray": 8.88, "Lilac": 10.8,
        "Lunar ash": 0.05, "Midnight gray": 0.05, "Orange": 10.29, "Pink": 9.86,
        "Purple gray": 0.05, "Red": 10.33, "Redhead": 0.05, "Salad green": 9.53,
        "Thundercloud": 0.05, "Warhammer": 0.05, "White": 10.76,
    },
    "Eyes": {
        "Amber Ember Eyes": 0.05, "Ash Phantom": 0.05, "Blood": 9.07, "Bloody eye": 0.05,
        "Crystal glint": 0.05, "Ghost eyes": 0.05, "Hi Tech": 8.92, "Honeycombs": 10.29,
        "Hot eyes": 0.05, "Hypnosis": 8.08, "Jester's Eyes": 0.05, "Legion g": 0.05,
        "Moon Shadow": 0.05, "Necromancer's Eyes": 0.05, "Omni eye": 0.05, "Pink": 8.27,
        "Pink glare": 8.97, "Purple": 9.35, "Red": 9.49, "Sandy": 0.05,
        "Shining Stream": 0.05, "Sorcerer eye": 0.05, "Thunderbolt Glow": 0.05,
        "Venom": 9.11, "Volcanic heat": 0.05, "White": 8.97, "Yellow highlights": 0.05,
        "Zombie": 8.69,
    },
    "Head": {
        "Barber Broo": 2.96, "Biker hairstyle": 2.54, "Bogocha glasses": 2.68,
        "Brown fashionable": 2.72, "CC": 2.72, "Cedar": 2.87, "Chef's hat": 2.35,
        "Corey": 0.05, "Crown Kings": 2.49, "Curly hair": 2.63, "Cyber detective hat": 3.62,
        "Cyclops": 3.1, "Deep Shadow": 0.05, "Diamond glasses": 2.82, "Didi": 1.69,
        "Digital glasses": 2.49, "Dir": 2.72, "Dragon helmet": 0.05, "Dreamer's cap": 0.05,
        "Earflap hat": 0.05, "Easter hat": 2.96, "Fashion glass": 2.4, "Fool's cap": 0.05,
        "Goggles": 3.15, "Golden wreath": 0.05, "Hermes": 2.72, "Hockey helmet": 3.05,
        "Horns of the Abyss": 0.05, "Hot cylinder": 0.05, "Jacket hat": 3.62,
        "Lab glasses": 2.68, "Mafia hat": 2.49, "Magnetus helmet": 3.29, "Major's cap": 2.3,
        "Mechanical glasses": 0.05, "Morning Mist Helmet": 0.05, "Neon glasses": 2.77,
        "Nightcap": 2.58, "Omni hair": 0.05, "Pork": 2.35, "Robocop helmet": 2.63,
        "Rose-colored glasses": 2.87, "Sand cape": 0.05, "Shadow Necromancer": 0.05,
        "Sharp visor": 2.68, "Shiny hat": 2.72, "Short hairstyle": 2.49, "Snow goggles": 2.96,
        "Sorcerer hair": 0.05, "Straw hat": 3.48, "Transparent wool": 0.05,
        "Warhammer helmet": 0.05, "Yellow 75 glasses": 2.63,
    },
    "Suits": {
        "Abibas": 1.69, "Astartes Space Marines": 0.05, "Balenci": 2.11, "Balenciaga": 1.41,
        "Belivera raincoat": 1.46, "Biker vest": 1.78, "Bottega Veneta": 1.41, "CC": 1.36,
        "Celine": 1.97, "Cloak of Near legion": 0.05, "Cook": 1.69, "Cyber detective": 1.6,
        "DG": 1.46, "Desert nomad": 0.05, "Didi": 1.64, "Dies": 1.78, "Digital down": 1.46,
        "Doctor": 1.83, "Dreamer": 0.05, "Easter costume": 1.13, "Exo suit": 1.46,
        "Exoskeleton": 1.46, "Farmer's shirt": 1.13, "Fire jacket": 1.64, "Ghost": 0.05,
        "Glamorous puffer": 1.6, "Glitch": 1.69, "Green acid": 1.5, "Green poison": 1.46,
        "Gucci jacket": 1.46, "Hawaiian shirt": 1.5, "Hermes coat": 1.41, "Hockey player": 1.55,
        "Hole time": 1.22, "Ice armor": 1.36, "Infected": 1.32, "Iron captain": 1.5,
        "Iron lava": 1.13, "Jacket": 1.32, "Jester's motley": 0.05, "Jordan": 1.74,
        "Kayvin Klein": 1.64, "LV": 1.32, "Louis Vuitton": 1.5, "Lvs": 1.17, "Mafia": 1.64,
        "Magic costume": 1.5, "Magnetus": 1.6, "Maki": 1.74, "Mantle Kings": 1.13,
        "Mechanical": 1.27, "Mechanical armor": 0.05, "Neon chains": 1.6,
        "Neon windbreaker": 1.55, "Nightgown": 1.22, "Nike": 1.32,
        "Obsidian Chain of Power": 0.05, "OmniBlinks": 0.05, "Peaked cap": 2.02,
        "Pearl jacket": 0.05, "Pink armor": 1.27, "Prada": 1.97, "Pulsar of Eternity": 1.08,
        "Raincoat": 1.32, "Red techno": 1.36, "Robocop": 1.5, "Robot": 1.41, "Saint L": 2.07,
        "Samurai": 0.05, "Samurai Ashigaru": 1.46, "Shadow Necromancer": 0.05,
        "Smoky ashes": 1.17, "Sorcerer": 0.05, "Summer shirt": 1.69, "Tailcoat suit": 0.05,
        "Vampire": 0.05, "Venom": 0.05, "White Fur Coat": 1.17, "White roba": 1.41,
        "Winter coat": 1.78, "Zeus": 0.05, "Zombie": 1.27, "jacket rhinestones": 1.83,
    },
    "Teeth": {
        "Alabaster tone": 0.09, "Amber spark": 0.05, "Echo of Ashes": 0.05,
        "Ethereal shine": 0.05, "Frozen teeth": 8.45, "Ghostly blue": 0.05, "Glint": 0.05,
        "Golden": 7.05, "Golden Fag": 0.05, "Gray": 8.03, "Jester's Teeth": 0.05,
        "Lava": 8.92, "Mechanical": 8.03, "Opal light": 0.05, "Orange": 8.41,
        "Palette": 8.27, "Purable white": 0.05, "Purple teeth": 0.05, "Rainbow": 9.39,
        "Raleigh RR-32": 8.41, "Reddish glow": 0.05, "Runes": 8.45, "Salad greens": 0.05,
        "Snow-white": 0.05, "Stone ruins": 8.45, "Titanium glitter": 0.05,
        "Vampire fangs": 0.05, "White": 7.33,
    },
};

function calculateRarityScore(attributes) {
    if (!attributes || !Array.isArray(attributes)) return 0;

    let totalScore = 0;

    for (const attr of attributes) {
        const traitType = attr.trait_type;
        const value = attr.value;

        if (!TRAIT_RARITY[traitType]) continue;

        const percentage = TRAIT_RARITY[traitType][value] || 5.0;
        totalScore += (1 / (percentage / 100));
    }

    return totalScore;
}

async function fetchMetadata(nftNumber) {
    const gateways = [
        `${IPFS_BASE}/${nftNumber}.json`,
        `https://ipfs.io/ipfs/bafybeibqzbodfn3xczppxh2k2ek3bgvojhivqy4ntbkprcxesulth3yy5e/${nftNumber}.json`,
        `https://cloudflare-ipfs.com/ipfs/bafybeibqzbodfn3xczppxh2k2ek3bgvojhivqy4ntbkprcxesulth3yy5e/${nftNumber}.json`,
    ];

    for (const url of gateways) {
        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 10000);

            const resp = await fetch(url, { signal: controller.signal });
            clearTimeout(timeout);

            if (resp.ok) {
                const json = await resp.json();
                return json;
            }
        } catch (e) {
            console.warn(`Failed gateway for ${nftNumber}:`, e.message);
        }
    }

    return null;
}

async function parseAll() {
    console.log('🚀 Парсинг', TOTAL_NFTS, 'NFT из IPFS...\n');

    const nfts = [];
    const batchSize = 50;

    for (let i = 1; i <= TOTAL_NFTS; i += batchSize) {
        const batch = [];

        for (let j = i; j < Math.min(i + batchSize, TOTAL_NFTS + 1); j++) {
            batch.push(
                fetchMetadata(j).then(meta => {
                    if (!meta || !meta.attributes) {
                        console.log(`❌ #${j} - failed`);
                        return null;
                    }

                    const score = calculateRarityScore(meta.attributes);
                    const tokenId = j - 1; // token_id = nftNumber - 1

                    console.log(`✅ #${j} (token ${tokenId}) - score: ${score.toFixed(2)}`);

                    return {
                        tokenId,
                        nftNumber: j,
                        score,
                        attributes: meta.attributes,
                    };
                })
            );
        }

        const results = await Promise.all(batch);
        nfts.push(...results.filter(Boolean));

        console.log(`\n📦 Обработано ${nfts.length}/${TOTAL_NFTS}\n`);

        // Небольшая задержка между батчами
        await new Promise(resolve => setTimeout(resolve, 1000));
    }

    // Сортируем по score (от большего к меньшему)
    nfts.sort((a, b) => b.score - a.score);

    // Присваиваем ранги
    const ranksMap = {};
    nfts.forEach((nft, index) => {
        const rank = index + 1;
        ranksMap[nft.tokenId] = rank;
        console.log(`🏆 Rank ${rank}: token ${nft.tokenId} (score ${nft.score.toFixed(2)})`);
    });

    // Сохраняем в JSON
    fs.writeFileSync(
        './public/hotcraft-ranks.json',
        JSON.stringify(ranksMap, null, 2)
    );

    console.log('\n✅ Готово! Создан файл public/hotcraft-ranks.json');
    console.log(`📊 Всего NFT: ${Object.keys(ranksMap).length}`);
}

parseAll().catch(console.error);