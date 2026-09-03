// Developer-only build step: copy the supplied wallpaper collection without modifying its originals.
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const project = path.resolve(__dirname, '..');
const sourceDirectory = path.resolve(project, '..', '壁纸');
const destinationDirectory = path.join(project, 'assets', 'wallpapers');
const mappings = [
  ['【哲风壁纸】短裤-美女-车窗.jpg', 'rain-window.jpg', '雨窗倩影', 'image'],
  ['【哲风壁纸】奥特曼-气泡-水下.jpg', 'ultra-tide.jpg', '碧海银翼', 'image'],
  ['【哲风壁纸】天空-孤独-小猫.jpg', 'ocean-cat.jpg', '海天猫语', 'image'],
  ['【哲风壁纸】夏日-好看-户外.jpg', 'summer-sky.jpg', '晴空漫夏', 'image'],
  ['【哲风壁纸】保险柜-办公室-卡通.jpg', 'krabs-vault.jpg', '蟹堡金库', 'image'],
  ['【哲风壁纸】侧脸-壁纸-忧郁.jpg', 'blue-portrait.jpg', '夜蓝侧影', 'image'],
  ['【哲风壁纸】休闲-室内-居家.jpg', 'home-cat.jpg', '暖室猫伴', 'image'],
  ['【哲风壁纸】云层-休闲-夏日.jpg', 'cloud-bench.jpg', '云岸长椅', 'image'],
  ['【哲风壁纸】书法-励志-国风.jpg', 'ink-aspiration.jpg', '墨志凌云', 'image'],
  ['【哲风壁纸】Kuroha作品-动漫线稿.mp4', 'kuroha-lines.mp4', '墨线幻梦', 'video'],
  ['【哲风壁纸】咧嘴笑-宝可梦.mp4', 'pokemon-smile.mp4', '星电笑颜', 'video'],
  ['【哲风壁纸】光点-动态-古风美女.mp4', 'ancient-fireflies.mp4', '流萤古梦', 'video'],
  ['【哲风壁纸】二次元-性感-插画.mp4', 'anime-nocturne.mp4', '绮绘夜色', 'video'],
  ['【哲风壁纸】丧系-人物-仰头.mp4', 'dusky-gaze.mp4', '暮影仰歌', 'video'],
  ['【哲风壁纸】下雨-懒羊羊-睡觉.mp4', 'rainy-sheep.mp4', '雨眠软云', 'video']
];

function sha256(bytes) { return crypto.createHash('sha256').update(bytes).digest('hex'); }

if (!fs.existsSync(sourceDirectory)) throw new Error(`壁纸素材目录不存在：${sourceDirectory}`);
const actual = fs.readdirSync(sourceDirectory, { withFileTypes: true }).filter((entry) => entry.isFile()).map((entry) => entry.name).sort();
const expected = mappings.map(([sourceName]) => sourceName).sort();
if (actual.length !== 15 || JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`壁纸素材应为指定的 15 个文件，实际 ${actual.length} 个`);

fs.mkdirSync(destinationDirectory, { recursive: true });
const manifest = [];
for (const [sourceName, fileName, name, type] of mappings) {
  const sourcePath = path.join(sourceDirectory, sourceName);
  const destinationPath = path.join(destinationDirectory, fileName);
  const bytes = fs.readFileSync(sourcePath);
  const digest = sha256(bytes);
  if (!fs.existsSync(destinationPath) || sha256(fs.readFileSync(destinationPath)) !== digest) fs.copyFileSync(sourcePath, destinationPath);
  manifest.push({ name, type, sourceName, fileName, size: bytes.length, sha256: digest });
  console.log(`${name}: ${sourceName} -> ${fileName}`);
}
fs.writeFileSync(path.join(destinationDirectory, 'supplied-manifest.json'), JSON.stringify({ version: 1, count: manifest.length, wallpapers: manifest }, null, 2));
console.log(`已准备 ${manifest.length} 个新增壁纸（静态 ${manifest.filter((item) => item.type === 'image').length} / 动态 ${manifest.filter((item) => item.type === 'video').length}）`);
