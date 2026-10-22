"""분식집 도트 시안: 동물/사람 직원·손님. 문자 격자 + 팔레트 + 자동 테두리."""
from PIL import Image, ImageDraw, ImageFont

PAL = {
    'E': (42, 32, 48), 'H': (255, 255, 255), 'W': (252, 248, 240), 'w': (218, 212, 206),
    'b': (246, 150, 158), 'M': (110, 44, 52), 't': (232, 96, 100), 'p': (244, 150, 162),
    'R': (222, 66, 54), 'r': (162, 40, 40), 'A': (250, 242, 226), 'a': (220, 206, 182),
    'L': (74, 64, 88), 'l': (52, 44, 64),
    'N': (56, 58, 96), 'n': (92, 96, 146), 'O': (236, 152, 70), 'o': (196, 110, 48),
    'C': (252, 236, 206), 'Y': (248, 198, 84), 'y': (222, 144, 50), 'T': (228, 172, 112),
    'G': (156, 156, 168), 'g': (96, 94, 110), 'P': (248, 176, 186), 'Q': (226, 128, 146),
    'D': (252, 216, 74), 'd': (242, 140, 44), 'V': (128, 198, 96), 'v': (78, 146, 70),
    'B': (122, 84, 60), 'u': (164, 120, 84),
    # 사람 피부·머리
    'k': (250, 218, 190), 'j': (230, 176, 134), 'J': (184, 122, 82), 'z': (124, 80, 56),
    'h': (78, 52, 40), 'i': (40, 34, 44), 'e': (206, 204, 212), 'U': (204, 110, 56), 'f': (240, 200, 110),
    # 옷 색
    '1': (124, 170, 224), '2': (244, 164, 92), '3': (150, 204, 124), '4': (198, 146, 214),
    '5': (246, 206, 96), '6': (230, 104, 104), '7': (86, 132, 220), '8': (110, 186, 180),
    # 가구·바닥
    'K': (218, 160, 98), 'c': (176, 116, 66), 'x': (130, 82, 48), 'F': (236, 226, 204), 'f2': (0, 0, 0),
    's': (190, 190, 196), 'm': (150, 150, 158),
}
OUTLINE = (44, 28, 34, 255)


def g(rows):
    w = len(rows[0])
    for r in rows:
        assert len(r) == w, (len(r), w, r)
    return [list(r) for r in rows]


def blank(w, h):
    return [['.'] * w for _ in range(h)]


def stamp(dst, src, x, y, remap=None, mask=False):
    """src를 dst의 (x, y)에 겹친다. '.'은 투명. mask=True면 dst가 칠해진 곳에만."""
    for j, row in enumerate(src):
        for i, ch in enumerate(row):
            if ch == '.':
                continue
            yy, xx = y + j, x + i
            if 0 <= yy < len(dst) and 0 <= xx < len(dst[0]):
                if mask and dst[yy][xx] == '.':
                    continue
                dst[yy][xx] = remap.get(ch, ch) if remap else ch
    return dst


def put(dst, pts, ch, mask=False):
    for (x, y) in pts:
        if 0 <= y < len(dst) and 0 <= x < len(dst[0]):
            if mask and dst[y][x] == '.':
                continue
            dst[y][x] = ch


def rect(x0, y0, x1, y1):
    return [(x, y) for y in range(y0, y1 + 1) for x in range(x0, x1 + 1)]


def flip(src):
    return [list(reversed(r)) for r in src]


def render(grid, outline=True):
    h, w = len(grid), len(grid[0])
    pad = 1 if outline else 0
    im = Image.new('RGBA', (w + 2 * pad, h + 2 * pad), (0, 0, 0, 0))
    px = im.load()
    for y in range(h):
        for x in range(w):
            ch = grid[y][x]
            if ch != '.':
                px[x + pad, y + pad] = PAL[ch] + (255,)
    if outline:
        src = im.copy().load()
        for y in range(h + 2):
            for x in range(w + 2):
                if src[x, y][3]:
                    continue
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    xx, yy = x + dx, y + dy
                    if 0 <= xx < w + 2 and 0 <= yy < h + 2 and src[xx, yy][3]:
                        px[x, y] = OUTLINE
                        break
    return im


# ---------------------------------------------------------------- 머리 (16 x 15, 둥근 머리는 (1, 4)부터)
HEAD = g([
    "....XXXXXX....",
    "..XXXXXXXXXX..",
    ".XXXXXXXXXXXX.",
    ".XXXXXXXXXXXX.",
    "XXXXXXXXXXXXXX",
    "XXXXXXXXXXXXXX",
    "XXXXXXXXXXXXXX",
    "XXXXXXXXXXXXXX",
    ".XXXXXXXXXXXX.",
    "..XXXXXXXXXX..",
    "....XXXXXX....",
])
HW, HH = 16, 15


def head_base(fur):
    c = blank(HW, HH)
    stamp(c, HEAD, 1, 4, {'X': fur})
    return c


def eyes(c, kind='normal', dark=False):
    """표정. 눈 위치: 왼쪽 (4-5, 9-10), 오른쪽 (10-11, 9-10). 입은 (7-8, 12)."""
    if kind == 'normal':
        if dark:
            put(c, rect(3, 8, 5, 10), 'W')
            put(c, rect(10, 8, 12, 10), 'W')
        put(c, rect(4, 9, 5, 10), 'E')
        put(c, rect(10, 9, 11, 10), 'E')
        put(c, [(4, 9), (10, 9)], 'H')
    elif kind == 'happy':
        put(c, [(3, 10), (4, 9), (5, 9), (6, 10)], 'E')
        put(c, [(9, 10), (10, 9), (11, 9), (12, 10)], 'E')
    elif kind == 'angry':
        if dark:
            put(c, rect(3, 8, 5, 10), 'W')
            put(c, rect(10, 8, 12, 10), 'W')
        put(c, rect(4, 9, 5, 10), 'E')
        put(c, rect(10, 9, 11, 10), 'E')
        put(c, [(3, 7), (4, 8), (5, 8)], 'E')      # 찡그린 눈썹
        put(c, [(12, 7), (11, 8), (10, 8)], 'E')


def blush(c):
    put(c, [(2, 11), (3, 11), (12, 11), (13, 11)], 'b')


def mouth(c, kind='normal', y=12):
    if kind == 'normal':
        put(c, [(7, y), (8, y)], 'M')
    elif kind == 'happy':
        put(c, [(6, y), (7, y), (8, y), (9, y)], 'M')
        put(c, [(7, y + 1), (8, y + 1)], 't')
    elif kind == 'angry':
        put(c, [(7, y), (8, y)], 'M')
        put(c, [(6, y + 1), (9, y + 1)], 'M')
    elif kind == 'cat':   # ω
        put(c, [(6, y), (9, y), (7, y + 1), (8, y + 1)], 'M')


def bandana(c, color='R', shade='r'):
    """직원 두건: 머리 위쪽 두 줄 + 오른쪽 매듭."""
    put(c, rect(1, 5, 14, 6), color, mask=True)
    put(c, rect(1, 7, 14, 7), shade, mask=True)
    put(c, [(15, 6), (15, 7), (14, 8)], color)


def bandana_back(c, color='R', shade='r'):
    put(c, rect(1, 5, 14, 7), color, mask=True)
    put(c, rect(1, 8, 14, 8), shade, mask=True)
    put(c, [(7, 9), (8, 9), (6, 10), (9, 10)], color)


# ---- 동물 머리 (얼굴 표정 kind)
def magpie(kind='normal', staff=True):
    c = head_base('N')
    put(c, [(7, 2), (8, 2), (8, 3), (7, 3), (9, 1)], 'N')          # 머리 깃
    put(c, rect(4, 5, 11, 5), 'n', mask=True)                       # 윤기
    if staff:
        bandana(c)
    eyes(c, kind, dark=True)
    put(c, [(7, 11), (8, 11)], 'm')                                 # 부리
    put(c, [(7, 12), (8, 12)], 'g')
    put(c, [(2, 12), (3, 12), (12, 12), (13, 12)], 'b')
    return c


def dog(kind='normal', staff=True):
    c = head_base('O')
    # 귀
    stamp(c, g([
        "..O.........O...",
        ".OOO.......OOO..",
        ".OCOO.....OOCO..",
        "OOCCO.....OCCOO.",
    ]), 0, 1)
    put(c, rect(3, 10, 12, 14), 'C', mask=True)                     # 주둥이·볼
    put(c, [(2, 11), (13, 11), (2, 12), (13, 12)], 'C', mask=True)
    if staff:
        bandana(c)
    put(c, [(4, 8), (11, 8)], 'C')                                  # 시바 눈썹
    eyes(c, kind)
    put(c, [(7, 11), (8, 11)], 'E')                                 # 코
    mouth(c, {'normal': 'cat', 'happy': 'happy', 'angry': 'angry'}[kind], 12)
    blush(c)
    return c


def cat(kind='normal', staff=True):
    c = head_base('Y')
    stamp(c, g([
        ".Y............Y.",
        ".YY..........YY.",
        ".YpY........YpY.",
        "YYppY......YppYY",
    ]), 0, 1)
    if staff:
        bandana(c)
    put(c, [(6, 8), (7, 8), (8, 8), (9, 8)], 'y') if not staff else None
    put(c, [(1, 9), (2, 9), (13, 9), (14, 9)], 'y', mask=True)      # 볼 줄무늬
    put(c, rect(5, 11, 10, 13), 'C', mask=True)
    eyes(c, kind)
    put(c, [(7, 11), (8, 11)], 'p')
    mouth(c, {'normal': 'cat', 'happy': 'happy', 'angry': 'angry'}[kind], 12)
    blush(c)
    return c


def hamster(kind='normal', staff=True):
    c = head_base('T')
    stamp(c, g([
        "..TT........TT..",
        ".TppT......TppT.",
    ]), 0, 3)
    put(c, rect(1, 10, 14, 14), 'W', mask=True)
    put(c, [(0, 10), (0, 11), (0, 12), (15, 10), (15, 11), (15, 12)], 'W')   # 볼주머니
    put(c, [(1, 13), (14, 13)], 'W')
    if staff:
        bandana(c)
    eyes(c, kind)
    put(c, [(7, 11), (8, 11)], 'p')
    mouth(c, {'normal': 'cat', 'happy': 'happy', 'angry': 'angry'}[kind], 12)
    put(c, [(2, 12), (3, 12), (12, 12), (13, 12)], 'b')
    return c


def panda(kind='normal', staff=True):
    c = head_base('W')
    stamp(c, g([
        ".EE..........EE.",
        "EEEE........EEEE",
        "EEE..........EEE",
    ]), 0, 2)
    if staff:
        bandana(c)
    # 눈 무늬(바깥으로 처진 타원)
    put(c, [(4, 8), (5, 8), (3, 9), (4, 9), (5, 9), (6, 9), (2, 10), (3, 10), (4, 10), (5, 10), (6, 10), (3, 11), (4, 11)], 'i')
    put(c, [(10, 8), (11, 8), (9, 9), (10, 9), (11, 9), (12, 9), (9, 10), (10, 10), (11, 10), (12, 10), (13, 10), (11, 11), (12, 11)], 'i')
    if kind == 'happy':
        put(c, [(3, 10), (4, 9), (5, 9), (6, 10)], 'W')
        put(c, [(9, 10), (10, 9), (11, 9), (12, 10)], 'W')
    else:
        put(c, rect(4, 9, 5, 10), 'E')
        put(c, rect(10, 9, 11, 10), 'E')
        put(c, [(4, 9), (10, 9)], 'H')
    put(c, [(7, 11), (8, 11)], 'E')
    mouth(c, {'normal': 'cat', 'happy': 'happy', 'angry': 'angry'}[kind], 12)
    put(c, [(2, 12), (13, 12)], 'b')
    return c


def rabbit(kind='normal'):
    c = head_base('W')
    stamp(c, g([
        "...WW....WW.....",
        "...WpW..WpW.....",
        "...WpW..WpW.....",
        "...WpW..WpW.....",
    ]), 1, 0)
    eyes(c, kind)
    put(c, [(7, 11), (8, 11)], 'p')
    mouth(c, {'normal': 'cat', 'happy': 'happy', 'angry': 'angry'}[kind], 12)
    blush(c)
    return c


def pig(kind='normal'):
    c = head_base('P')
    stamp(c, g([
        ".QQ..........QQ.",
        ".QQQ........QQQ.",
        "..QQ........QQ..",
    ]), 0, 3)
    eyes(c, kind)
    put(c, rect(6, 11, 9, 13), 'Q')
    put(c, [(6, 11), (9, 11), (6, 13), (9, 13)], 'P')
    put(c, [(7, 12), (8, 12)], 'M')
    if kind == 'happy':
        put(c, [(1, 12), (2, 12), (13, 12), (14, 12)], 'b')
    else:
        put(c, [(2, 12), (13, 12)], 'b')
    return c


def duck(kind='normal'):
    c = head_base('D')
    put(c, [(7, 2), (8, 3), (7, 3), (6, 3)], 'D')
    eyes(c, kind)
    put(c, rect(5, 11, 10, 12), 'd')
    put(c, [(5, 12), (10, 12)], 'D')
    if kind == 'happy':
        put(c, rect(6, 13, 9, 13), 'd')
    blush(c)
    return c


def frog(kind='normal'):
    c = head_base('V')
    stamp(c, g([
        "..VVVV....VVVV..",
        ".VVVVVV..VVVVVV.",
        ".VVVVVV..VVVVVV.",
    ]), 0, 2)
    # 위로 튀어나온 눈
    if kind == 'happy':
        put(c, [(2, 4), (3, 3), (4, 3), (5, 4)], 'E')
        put(c, [(10, 4), (11, 3), (12, 3), (13, 4)], 'E')
    else:
        put(c, rect(2, 3, 5, 5), 'W')
        put(c, rect(10, 3, 13, 5), 'W')
        put(c, rect(3, 4, 4, 5), 'E')
        put(c, rect(11, 4, 12, 5), 'E')
        put(c, [(3, 4), (11, 4)], 'H')
        if kind == 'angry':
            put(c, [(2, 2), (3, 2), (12, 2), (13, 2)], 'E')
    put(c, rect(3, 12, 12, 13), 'C', mask=True)
    if kind == 'happy':
        put(c, [(4, 10), (5, 11), (6, 11), (7, 11), (8, 11), (9, 11), (10, 11), (11, 10)], 'v')
    elif kind == 'angry':
        put(c, [(4, 11), (5, 10), (6, 10), (7, 10), (8, 10), (9, 10), (10, 10), (11, 11)], 'v')
    else:
        put(c, [(4, 10), (5, 11), (6, 11), (7, 11), (8, 11), (9, 11), (10, 11), (11, 10)], 'v')
    put(c, [(2, 9), (3, 9), (12, 9), (13, 9)], 'b')
    return c


def animal_back(fur, ears=None, staff=True, tail=None):
    c = head_base(fur)
    if ears:
        stamp(c, g(ears[0]), 0, ears[1])
    if staff:
        bandana_back(c)
    return c


# ---- 사람 머리
def human(skin, hair, style, kind='normal', staff=False, glasses=False):
    c = head_base(skin)
    put(c, [(0, 9), (0, 10), (15, 9), (15, 10)], skin)            # 귀
    hs = {
        'short': [
            "................",
            "................",
            "................",
            ".....hhhhhh.....",
            "...hhhhhhhhhh...",
            "..hhhhhhhhhhhh..",
            "..hhhhhhhhhhhh..",
            ".hhhh.hhh.hhhhh.",
            ".hh..........hh.",
            ".h............h.",
        ],
        'bob': [
            "................",
            "................",
            "................",
            ".....hhhhhh.....",
            "...hhhhhhhhhh...",
            "..hhhhhhhhhhhh..",
            ".hhhhhhhhhhhhhh.",
            ".hhhhhhhhhhhhhh.",
            "hhh..........hhh",
            "hhh..........hhh",
            "hhh..........hhh",
            "hhh..........hhh",
            ".hh..........hh.",
        ],
        'bun': [
            "......hhhh......",
            ".....hhhhhh.....",
            "......hhhh......",
            ".....hhhhhh.....",
            "...hhhhhhhhhh...",
            "..hhhhhhhhhhhh..",
            "..hhhhhhhhhhhh..",
            ".hhhhh....hhhhh.",
            ".hh..........hh.",
            ".h............h.",
        ],
        'curly': [
            "................",
            "................",
            "....hh.hh.hh....",
            "...hhhhhhhhhh...",
            "..hhhhhhhhhhhh..",
            ".hhhhhhhhhhhhhh.",
            ".hhhhhhhhhhhhhh.",
            "hhh.hh.hh.hh.hhh",
            "hh............hh",
            ".h............h.",
        ],
        'spiky': [
            "................",
            "................",
            "....h..h..h.....",
            "....hh.hh.hh....",
            "...hhhhhhhhhh...",
            "..hhhhhhhhhhhh..",
            "..hhhhhhhhhhhh..",
            ".hhh.hhhh.hhhh..",
            ".hh..........hh.",
            "................",
        ],
        'cap': [
            "................",
            "................",
            "................",
            ".....666666.....",
            "...6666666666...",
            "..666666666666..",
            "..666666666666..",
            ".hhh66666666666666",
            ".hh..........hh.",
            "................",
        ],
    }[style]
    rows = [r[:16].ljust(16, '.') for r in hs]
    stamp(c, g(rows), 0, 0, {'h': hair})
    if style == 'cap':
        put(c, [(14, 7), (15, 7)], '6')
    if staff:
        put(c, rect(2, 5, 13, 6), 'R', mask=True)
        put(c, rect(2, 7, 13, 7), 'r', mask=True)
        put(c, [(15, 6), (15, 7), (14, 8)], 'R')
    eyes(c, kind)
    if glasses:
        for (x0, x1) in ((3, 6), (9, 12)):
            put(c, [(x, 8) for x in range(x0, x1 + 1)] + [(x, 11) for x in range(x0, x1 + 1)]
                + [(x0, 9), (x0, 10), (x1, 9), (x1, 10)], 'g')
        put(c, [(7, 9), (8, 9)], 'g')
    mouth(c, kind, 12)
    blush(c)
    return c


def human_back(skin, hair, style, staff=False):
    c = head_base(hair)
    put(c, [(0, 9), (0, 10), (15, 9), (15, 10)], skin)
    put(c, rect(4, 13, 11, 14), skin, mask=True)                   # 목덜미
    if style == 'bun':
        put(c, rect(6, 1, 9, 3), hair)
    if style == 'cap':
        put(c, rect(1, 4, 14, 8), '6', mask=True)
    if staff:
        bandana_back(c)
    return c


# ---------------------------------------------------------------- 몸
STAFF_BODY = g([
    "....SSSSSSSS....",
    "...SSAAAAAASS...",
    "..SSSAAAAAASSS..",
    "..FSSAAaaAASSF..",
    "..FF.AAAAAA.FF..",
    "....AAAAAAAA....",
    "....LL....LL....",
    "...lll....lll...",
])
STAFF_BODY_BACK = g([
    "....SSSSSSSS....",
    "...SSSAAAASSS...",
    "..SSSSSAASSSSS..",
    "..FSSSSAASSSSF..",
    "..FF.SAAAAS.FF..",
    "....SSSSSSSS....",
    "....LL....LL....",
    "...lll....lll...",
])
WALK_A = [
    "....LL....ll....",
    "...lll..........",
]
WALK_B = [
    "....ll....LL....",
    "..........lll...",
]
TRAY_ARMS = g([
    "....SSSSSSSS....",
    "..FSSAAAAAASSF..",
    "..FSSAAAAAASSF..",
    "...SAAAaaAAAS...",
    "....AAAAAAAA....",
    "....AAAAAAAA....",
    "....LL....LL....",
    "...lll....lll...",
])


def staff(head, shirt, paw, frame='stand', back=False, tray=None):
    """머리(16x15) + 몸(16x8). tray면 머리 위에 쟁반."""
    top = 6 if tray else 0
    c = blank(16, 15 + 7 + top)
    body = STAFF_BODY_BACK if back else (TRAY_ARMS if tray else STAFF_BODY)
    body = [row[:] for row in body]
    if frame in ('a', 'b'):
        legs = WALK_A if frame == 'a' else WALK_B
        body[6] = list(legs[0])
        body[7] = list(legs[1])
    stamp(c, body, 0, 14 + top, {'S': shirt, 'F': paw})
    stamp(c, head, 0, top)
    if tray:
        # 손을 쟁반까지 올린다
        put(c, [(1, top + 4), (14, top + 4), (1, top + 5), (14, top + 5)], paw)
        stamp(c, tray, 0, 0)
    return c


def bob(grid, dy):
    if dy == 0:
        return grid
    w = len(grid[0])
    return [['.'] * w for _ in range(dy)] + [r[:] for r in grid]


SHOULDERS = g([
    "...CCCCCCCCCC...",
    "..CCCCCCCCCCCC..",
    ".CCCCCCCCCCCCCC.",
    ".CCCCCCCCCCCCCC.",
])


def guest(head, cloth):
    c = blank(16, 15 + 3)
    stamp(c, SHOULDERS, 0, 14, {'C': cloth})
    stamp(c, head, 0, 0)
    return c


# ---------------------------------------------------------------- 음식·가구
DISH_TTEOK = g([
    "..tttt..",
    ".tRtRtt.",
    "WWWWWWWW",
    ".wWWWWw.",
])
DISH_KIMBAP = g([
    ".EE.EE..",
    "E3YE3YE.",
    "WWWWWWWW",
    ".wWWWWw.",
])
DISH_WATER = g([
    ".HH.....",
    ".77.YY..",
    ".77.YY..",
    "WWWWWWWW",
])


def tray_with(dishes):
    t = blank(16, 6)
    stamp(t, g([
        "................",
        "................",
        "................",
        "................",
        "ssssssssssssssss",
        ".mmmmmmmmmmmmmm.",
    ]), 0, 0)
    x = 0
    for d in dishes:
        stamp(t, d, x, 0)
        x += 5 if len(dishes) > 2 else 8
    return t


TABLE = g([
    "..KKKKKKKKKKKKKKKKKKKK..",
    ".KKKKKKKKKKKKKKKKKKKKKK.",
    "KKKKKKKKKKKKKKKKKKKKKKKK",
    "KKKKKKKKKKKKKKKKKKKKKKKK",
    "KKKKKKKKKKKKKKKKKKKKKKKK",
    "KKKKKKKKKKKKKKKKKKKKKKKK",
    "cccccccccccccccccccccccc",
    "cccccccccccccccccccccccc",
    "..xx................xx..",
    "..xx................xx..",
    "..xx................xx..",
])
STOOL = g([
    ".BBBBBBBB.",
    "BuuuuuuuuB",
    ".BBBBBBBB.",
    "..x....x..",
    "..x....x..",
])
STEAM = g([
    "......H.......H.......H.",
    ".....H.......H.......H..",
    "......H.......H.......H.",
    ".....H.......H.......H..",
])
PAN_STATION = g([
    "..gggggggggggggggggggg..",
    ".gEEEEEEEEEEEEEEEEEEEEg.",
    "gE66t66666t66666t66666Eg",
    "gE6WW66W666WW6C6666WW6Eg",
    "gE66666WW6666666WW66C6Eg",
    ".gEEEEEEEEEEEEEEEEEEEEg.",
    "ssssssssssssssssssssssss",
    "smmmmmmmmmmmmmmmmmmmmmms",
    "smmmmmmmm6666666mmmmmmms",
    "smmmmmmmmmmmmmmmmmmmmmms",
    "gggggggggggggggggggggggg",
    "g......................g",
])
BUBBLE = g([
    ".WWWWWWWWWWWW.",
    "WWWWWWWWWWWWWW",
    "WWWWEEWEEWWWWW",
    "WWWE3YE3YEWWWW",
    "WWWE3YE3YEWWWW",
    "WWWWEEWEEWWWWW",
    "WWWWWWWWWWWWWW",
    ".WWWWWWWWWWWW.",
    "..WW..........",
    ".WW...........",
])
PATIENCE = g([
    "VVVVVVVwww",
])
CUP = g([
    "H7.",
    "77.",
    "77Y",
])
HEART = g([
    ".t.t.",
    "ttttt",
    ".ttt.",
    "..t..",
])


def wall(w, h):
    c = blank(w, h)
    for y in range(h):
        for x in range(w):
            c[y][x] = 'B' if (x // 6) % 2 == 0 else 'u'
    put(c, rect(0, h - 2, w - 1, h - 1), 'x')
    # 메뉴판
    put(c, rect(6, 2, 42, 10), 'W')
    put(c, rect(6, 2, 42, 3), '6')
    for i, y in enumerate((5, 7, 9)):
        put(c, rect(9, y, 22, y), 'E')
        put(c, rect(32, y, 39, y), 'E')
    # 창문
    put(c, rect(60, 2, 84, 10), 'x')
    put(c, rect(61, 3, 71, 9), '1')
    put(c, rect(73, 3, 83, 9), '1')
    put(c, [(63, 4), (64, 4), (65, 4), (76, 6), (77, 6)], 'W')
    return c


STOVE = g([
    "ssssssssssssssssssssss",
    "smmmmmmmmmmmmmmmmmmmms",
    "sm6t6t6t6t6t6t6t6t6tms",
    "sm6WW6WW6WW6WW6WW6W6ms",
    "sm66666666666666666ms.",
    "smmmmmmmmmmmmmmmmmmmms",
    "gggggggggggggggggggggg",
    "gEEEEEEEEEEEEEEEEEEEEg",
    "gggggggggggggggggggggg",
    "g....................g",
    "g....................g",
])
