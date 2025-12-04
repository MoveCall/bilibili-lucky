import { BilibiliComment } from '../types';

const MOCK_AVATARS = [
  "https://picsum.photos/100/100?random=1",
  "https://picsum.photos/100/100?random=2",
  "https://picsum.photos/100/100?random=3",
  "https://picsum.photos/100/100?random=4",
  "https://picsum.photos/100/100?random=5",
];

const MOCK_NAMES = [
  "TechMaster", "GamingGod", "BiliFan123", "AnimeLover", "CodeNinja",
  "MusicNote", "TravelerZero", "FoodieX", "CatPerson", "DoggoLover"
];

const MOCK_MESSAGES = [
  "接好运！希望中奖",
  "想要这个礼物，求求了",
  "接好运，感谢UP主",
  "分母来了",
  "想要想要！",
  "必须接好运",
  "UP主太好了，想要",
  "纯粹支持一下",
  "接好运接好运",
  "非常想要，希望能抽中我"
];

export const generateMockComments = (count: number): BilibiliComment[] => {
  return Array.from({ length: count }).map((_, index) => {
    const isKeyword = Math.random() > 0.3; // 70% chance to have keyword
    const msgBase = MOCK_MESSAGES[Math.floor(Math.random() * MOCK_MESSAGES.length)];
    
    return {
      rpid: 100000 + index,
      oid: 123456,
      member: {
        mid: (50000 + index).toString(),
        uname: MOCK_NAMES[index % MOCK_NAMES.length] + `_${index}`,
        avatar: MOCK_AVATARS[index % MOCK_AVATARS.length],
        level_info: {
          current_level: Math.floor(Math.random() * 6) + 1,
        },
      },
      content: {
        message: isKeyword ? msgBase : "不明觉厉",
      },
      ctime: Date.now() - Math.floor(Math.random() * 10000000),
      like: Math.floor(Math.random() * 100),
    };
  });
};