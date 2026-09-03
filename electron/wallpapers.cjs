const WALLPAPER_DEFINITIONS = Object.freeze([
  { id: 'obsidian', name: '曜石流光', type: 'static', description: '静态 · 深空渐变', colors: ['#08090f', '#4b386f'], gradient: 'radial-gradient(circle at 24% 20%, rgba(112,89,166,.52), transparent 34%), radial-gradient(circle at 78% 72%, rgba(42,116,121,.28), transparent 36%), linear-gradient(145deg, #07080d 0%, #191225 50%, #090b12 100%)' },
  { id: 'dusk-bloom', name: '暮紫余晖', type: 'static', description: '静态 · 暮色绯紫', colors: ['#1a1028', '#b2627d'], gradient: 'radial-gradient(circle at 78% 22%, rgba(210,103,137,.48), transparent 32%), radial-gradient(circle at 22% 78%, rgba(98,75,170,.42), transparent 36%), linear-gradient(145deg, #090711 0%, #24132e 48%, #111225 100%)' },
  { id: 'deep-tide', name: '深海微光', type: 'static', description: '静态 · 冰蓝潮汐', colors: ['#06121d', '#3b9b9d'], gradient: 'radial-gradient(circle at 72% 28%, rgba(71,184,182,.4), transparent 34%), radial-gradient(circle at 18% 75%, rgba(55,91,154,.4), transparent 38%), linear-gradient(150deg, #04080f 0%, #071b2a 52%, #0b101b 100%)' },
  { id: 'amber-night', name: '琥珀夜航', type: 'static', description: '静态 · 暖金夜幕', colors: ['#130d0a', '#b87445'], gradient: 'radial-gradient(circle at 75% 28%, rgba(218,143,78,.42), transparent 32%), radial-gradient(circle at 24% 74%, rgba(121,53,70,.32), transparent 36%), linear-gradient(145deg, #090707 0%, #23140f 50%, #111018 100%)' },
  { id: 'anime-girl', name: '绛瞳予心', type: 'video', description: '动态 · 绯瞳心光', fileName: 'anime-girl.mp4', posterFileName: 'anime-girl-poster.jpg', colors: ['#170c18', '#b3486c'] },
  { id: 'color-light', name: '冰澜映瞳', type: 'video', description: '动态 · 冰蓝映光', fileName: 'color-light.mp4', posterFileName: 'color-light-poster.jpg', colors: ['#0c1423', '#68a8c9'] },
  { id: 'rain-window', name: '雨窗倩影', type: 'image', description: '静态 · 雨幕车窗', fileName: 'rain-window.jpg', posterFileName: 'rain-window-poster.jpg', colors: ['#101a15', '#82776d'] },
  { id: 'ultra-tide', name: '碧海银翼', type: 'image', description: '静态 · 深海银光', fileName: 'ultra-tide.jpg', posterFileName: 'ultra-tide-poster.jpg', colors: ['#17353d', '#b5d9d9'] },
  { id: 'ocean-cat', name: '海天猫语', type: 'image', description: '静态 · 晴海独望', fileName: 'ocean-cat.jpg', posterFileName: 'ocean-cat-poster.jpg', colors: ['#173d62', '#a9c9dc'] },
  { id: 'summer-sky', name: '晴空漫夏', type: 'image', description: '静态 · 盛夏蓝天', fileName: 'summer-sky.jpg', posterFileName: 'summer-sky-poster.jpg', colors: ['#1165aa', '#d6e9f4'] },
  { id: 'krabs-vault', name: '蟹堡金库', type: 'image', description: '静态 · 奇趣办公室', fileName: 'krabs-vault.jpg', posterFileName: 'krabs-vault-poster.jpg', colors: ['#263e54', '#c6913f'] },
  { id: 'blue-portrait', name: '夜蓝侧影', type: 'image', description: '静态 · 深蓝心绪', fileName: 'blue-portrait.jpg', posterFileName: 'blue-portrait-poster.jpg', colors: ['#07121f', '#5b7398'] },
  { id: 'home-cat', name: '暖室猫伴', type: 'image', description: '静态 · 居家午后', fileName: 'home-cat.jpg', posterFileName: 'home-cat-poster.jpg', colors: ['#2b2522', '#b39e86'] },
  { id: 'cloud-bench', name: '云岸长椅', type: 'image', description: '静态 · 云海长风', fileName: 'cloud-bench.jpg', posterFileName: 'cloud-bench-poster.jpg', colors: ['#0d355c', '#a7d3e5'] },
  { id: 'ink-aspiration', name: '墨志凌云', type: 'image', description: '静态 · 水墨箴言', fileName: 'ink-aspiration.jpg', posterFileName: 'ink-aspiration-poster.jpg', colors: ['#d7c28b', '#f4f1e8'] },
  { id: 'kuroha-lines', name: '墨线幻梦', type: 'video', description: '动态 · 黑白线稿', fileName: 'kuroha-lines.mp4', posterFileName: 'kuroha-lines-poster.jpg', colors: ['#101016', '#9b8ea8'] },
  { id: 'pokemon-smile', name: '星电笑颜', type: 'video', description: '动态 · 童趣电光', fileName: 'pokemon-smile.mp4', posterFileName: 'pokemon-smile-poster.jpg', colors: ['#25203d', '#e4c648'] },
  { id: 'ancient-fireflies', name: '流萤古梦', type: 'video', description: '动态 · 光点古风', fileName: 'ancient-fireflies.mp4', posterFileName: 'ancient-fireflies-poster.jpg', colors: ['#17182c', '#d5a866'] },
  { id: 'anime-nocturne', name: '绮绘夜色', type: 'video', description: '动态 · 插画流光', fileName: 'anime-nocturne.mp4', posterFileName: 'anime-nocturne-poster.jpg', colors: ['#24152f', '#c66e9b'] },
  { id: 'dusky-gaze', name: '暮影仰歌', type: 'video', description: '动态 · 低饱和人像', fileName: 'dusky-gaze.mp4', posterFileName: 'dusky-gaze-poster.jpg', colors: ['#17171d', '#736579'] },
  { id: 'rainy-sheep', name: '雨眠软云', type: 'video', description: '动态 · 雨夜安眠', fileName: 'rainy-sheep.mp4', posterFileName: 'rainy-sheep-poster.jpg', colors: ['#142236', '#7591ad'] }
]);

const WALLPAPER_IDS = new Set(WALLPAPER_DEFINITIONS.map((wallpaper) => wallpaper.id));

module.exports = { WALLPAPER_DEFINITIONS, WALLPAPER_IDS };
