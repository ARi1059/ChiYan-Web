const U = "https://images.unsplash.com/";

export interface Model {
  id: string;
  alias: string;
  height: number;
  weight: number;
  bust: number;
  waist: number;
  hip: number;
  shoeSize: number;
  location: string;
  styles: string[];
  status: "在班" | "空闲" | "休息";
  photo: string;
  photos: string[];
  qqNumber: string;
  description: string;
  featured: boolean;
}

export const MODELS: Model[] = [
  {
    id: "1",
    alias: "晓薇",
    height: 168,
    weight: 48,
    bust: 86,
    waist: 62,
    hip: 90,
    shoeSize: 37,
    location: "上海",
    styles: ["清纯", "时尚"],
    status: "在班",
    photo: U + "photo-1636153279424-cb5d1e00f5a2?w=400&h=560&fit=crop&auto=format",
    photos: [
      U + "photo-1636153279424-cb5d1e00f5a2?w=400&h=560&fit=crop&auto=format",
      U + "photo-1533392151650-269f96231f65?w=400&h=560&fit=crop&auto=format",
    ],
    qqNumber: "234567890",
    description: "气质清纯，擅长清新风格拍摄，具有丰富的商业广告经验。性格开朗，配合度高。",
    featured: true,
  },
  {
    id: "2",
    alias: "柔儿",
    height: 165,
    weight: 46,
    bust: 84,
    waist: 60,
    hip: 88,
    shoeSize: 36,
    location: "北京",
    styles: ["甜美", "OL"],
    status: "在班",
    photo: U + "photo-1616639943825-e0fbad20a3d3?w=400&h=560&fit=crop&auto=format",
    photos: [
      U + "photo-1616639943825-e0fbad20a3d3?w=400&h=560&fit=crop&auto=format",
    ],
    qqNumber: "345678901",
    description: "甜美可人，专注于商业写真与产品拍摄，镜头感极佳。",
    featured: true,
  },
  {
    id: "3",
    alias: "曦曦",
    height: 170,
    weight: 50,
    bust: 88,
    waist: 64,
    hip: 92,
    shoeSize: 38,
    location: "广州",
    styles: ["时尚", "高冷"],
    status: "在班",
    photo: U + "photo-1581841064838-a470c740e8ee?w=400&h=560&fit=crop&auto=format",
    photos: [
      U + "photo-1581841064838-a470c740e8ee?w=400&h=560&fit=crop&auto=format",
    ],
    qqNumber: "456789012",
    description: "身材高挑，气场强大，擅长高级时装及大片拍摄。",
    featured: false,
  },
  {
    id: "4",
    alias: "婷婷",
    height: 163,
    weight: 45,
    bust: 83,
    waist: 59,
    hip: 87,
    shoeSize: 36,
    location: "上海",
    styles: ["清纯", "邻家"],
    status: "空闲",
    photo: U + "photo-1601117830731-1a36c879f666?w=400&h=560&fit=crop&auto=format",
    photos: [
      U + "photo-1601117830731-1a36c879f666?w=400&h=560&fit=crop&auto=format",
    ],
    qqNumber: "567890123",
    description: "邻家女孩气质，温柔亲切，适合各类产品代言与日系风格。",
    featured: false,
  },
  {
    id: "5",
    alias: "安安",
    height: 167,
    weight: 49,
    bust: 87,
    waist: 63,
    hip: 91,
    shoeSize: 37,
    location: "成都",
    styles: ["甜美", "复古"],
    status: "在班",
    photo: U + "photo-1677715156741-b7af71207c4d?w=400&h=560&fit=crop&auto=format",
    photos: [
      U + "photo-1677715156741-b7af71207c4d?w=400&h=560&fit=crop&auto=format",
    ],
    qqNumber: "678901234",
    description: "复古与甜美兼备，擅长轻熟风与法式风格，人气持续上升。",
    featured: true,
  },
  {
    id: "6",
    alias: "诗诗",
    height: 166,
    weight: 47,
    bust: 85,
    waist: 61,
    hip: 89,
    shoeSize: 37,
    location: "北京",
    styles: ["知性", "OL"],
    status: "空闲",
    photo: U + "photo-1646589391794-566792b13cae?w=400&h=560&fit=crop&auto=format",
    photos: [
      U + "photo-1646589391794-566792b13cae?w=400&h=560&fit=crop&auto=format",
    ],
    qqNumber: "789012345",
    description: "知性优雅，气质卓越，擅长职场类与品牌形象拍摄。",
    featured: false,
  },
  {
    id: "7",
    alias: "欣欣",
    height: 169,
    weight: 49,
    bust: 87,
    waist: 63,
    hip: 91,
    shoeSize: 38,
    location: "深圳",
    styles: ["活力", "运动"],
    status: "休息",
    photo: U + "photo-1615262239202-b8baf40fe5cf?w=400&h=560&fit=crop&auto=format",
    photos: [
      U + "photo-1615262239202-b8baf40fe5cf?w=400&h=560&fit=crop&auto=format",
    ],
    qqNumber: "890123456",
    description: "阳光活力，擅长运动品牌及户外拍摄，充满感染力。",
    featured: false,
  },
  {
    id: "8",
    alias: "若若",
    height: 165,
    weight: 46,
    bust: 84,
    waist: 60,
    hip: 88,
    shoeSize: 36,
    location: "杭州",
    styles: ["仙气", "国风"],
    status: "在班",
    photo: U + "photo-1698165265214-65ae17328625?w=400&h=560&fit=crop&auto=format",
    photos: [
      U + "photo-1698165265214-65ae17328625?w=400&h=560&fit=crop&auto=format",
    ],
    qqNumber: "901234567",
    description: "仙气飘飘，擅长国风汉服与唯美写真，网络人气极高。",
    featured: true,
  },
];

export const AGENCY_QQ = "888888888";
export const AGENCY_QQ_GROUP = "12345678";
export const ALL_STYLES = ["清纯", "时尚", "甜美", "OL", "高冷", "邻家", "复古", "知性", "活力", "仙气", "国风", "运动"];
export const ALL_LOCATIONS = ["上海", "北京", "广州", "成都", "深圳", "杭州"];
