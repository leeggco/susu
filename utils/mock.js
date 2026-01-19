const titlePrefixes = [
  '【3人团】',
  '【爆款】',
  '【限时补贴】',
  '【源头直供】',
  '【品牌直降】'
]

const titleGoods = [
  '维达抽纸超韧3层100抽',
  '加厚垃圾袋家用中号',
  '洁净洗衣凝珠50颗',
  'ins风陶瓷餐盘套装ins风陶瓷餐盘套装ins风陶瓷餐盘套装',
  '不粘锅平底炒锅',
  '儿童保暖内衣套装',
  '无糖苏打饼干整箱无糖苏打饼干整箱无糖苏打饼干整箱',
  '家用卷纸4层10卷',
  '一次性洗脸巾100抽',
  '自动晴雨两用伞',
  '无线蓝牙耳机无线蓝牙耳机无线蓝牙耳机无线蓝牙耳机无线蓝牙耳机',
  '双面厨房抹布10条',
  '加厚保鲜袋100只',
  '柔软毛巾3条装',
  '多功能收纳盒',
  '便携榨汁杯便携榨汁杯便携榨汁杯便携榨汁杯便携榨汁杯',
  '健身弹力带套装',
  '速干运动T恤',
  '维生素C泡腾片',
  '高弹瑜伽裤'
]

const salesTips = [
  '已拼10万+件',
  '已拼5万+件',
  '已拼20万+件',
  '已拼8万+件',
  '已拼3万+件'
]

const appIds = [
  'wx1234567890abcd',
  'wx9f8e7d6c5b4a3210',
  'wx0f1e2d3c4b5a6789'
]

const randomPick = (list) => list[Math.floor(Math.random() * list.length)]
const randomInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min

let seed = 1000

const createTitle = () => `${randomPick(titlePrefixes)}${randomPick(titleGoods)}...`

const createPrice = () => Number((Math.random() * 35 + 6).toFixed(1))

const createOriginalPrice = (price) =>
  Number((price + Math.random() * 60 + 10).toFixed(1))

const createSalesTip = () => {
  if (Math.random() > 0.5) {
    return randomPick(salesTips)
  }
  const save = (Math.random() * 40 + 5).toFixed(1)
  return `赚${save}元`
}

const createPath = (id) => `/pages/detail/detail?id=${id}`

const createImage = (id) => `https://picsum.photos/seed/pdd-${id}/400/400`

const platforms = ['拼多多', '京东', '淘宝']

const createGoodsItem = (id) => {
  const price = createPrice()
  const groupSize = randomInt(2, 5)
  const joinedCount = randomInt(1, groupSize - 1)
  const now = Date.now()
  // Random end time between 10 minutes and 2 hours from now
  const endTime = now + randomInt(10 * 60 * 1000, 2 * 60 * 60 * 1000)
  
  return {
    id,
    title: createTitle(),
    image: createImage(id),
    price,
    original_price: createOriginalPrice(price),
    sales_tip: createSalesTip(),
    group_size: groupSize,
    joined_count: joinedCount,
    app_id: randomPick(appIds),
    path: createPath(id),
    platform: randomPick(platforms),
    end_time: endTime
  }
}

const allGoodsCache = []

const getGoodsList = (count = 20) => {
  const list = []
  for (let i = 0; i < count; i += 1) {
    seed += 1
    const item = createGoodsItem(seed)
    list.push(item)
    allGoodsCache.push(item)
  }
  return list
}

const getGoodsById = (id) => {
  return allGoodsCache.find(item => item.id == id)
}

module.exports = {
  getGoodsList,
  getGoodsById
}
