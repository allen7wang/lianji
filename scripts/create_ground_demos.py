"""Create original movement diagrams from joint coordinates; no source images used."""
from pathlib import Path
import math
import os
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1] / 'assets/exercises'
FONT = ImageFont.truetype(os.environ.get('LIANJI_DEMO_FONT', '/System/Library/Fonts/STHeiti Medium.ttc'), 16)
BG, INK, GREEN, FAR = '#f5f7f4', '#28392f', '#8cb64e', '#9cae95'

def limb(draw, points, color=GREEN, width=9):
    draw.line(points, fill=color, width=width, joint='curve')
    for x,y in points:
        r=width/2
        draw.ellipse((x-r,y-r,x+r,y+r),fill=color)

def head(draw, center):
    x,y=center
    draw.ellipse((x-13,y-15,x+13,y+15),fill=INK)

def blend(a,b,t):return (a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t)

def breathe(draw,center,t):
    x,y=center;r=9+4*(1-math.cos(t))/2
    draw.ellipse((x-r,y-r,x+r,y+r),outline=GREEN,width=2)

def render(name,title,caption):
    frames=[]
    for i in range(40):
        t=math.tau*i/40
        image=Image.new('RGB',(512,288),BG);d=ImageDraw.Draw(image)
        d.text((20,12),title,fill=INK,font=FONT)
        d.line([(40,229),(473,229)],fill='#ced6cc',width=3)
        if name=='jumping_jack':
            opened=(1-math.cos(t))/2
            limb(d,[(244,153),blend((241,191),(198,191),opened),blend((240,225),(166,225),opened)],FAR,12)
            limb(d,[(268,153),blend((273,191),(314,191),opened),blend((272,225),(346,225),opened)],GREEN,12)
            limb(d,[(256,97),(256,154)],INK,24);head(d,(256,69))
            limb(d,[(241,98),blend((224,145),(207,70),opened),blend((222,191),(192,42),opened)],FAR)
            limb(d,[(271,98),blend((288,145),(305,70),opened),blend((290,191),(320,42),opened)],GREEN)
        elif name in ['beast_hold','bird_dog','cat_cow']:
            shoulder=(190,154 if name=='beast_hold' else 130);hip=(318,158 if name=='beast_hold' else 132)
            knee=(318,216 if name=='beast_hold' else 222)
            limb(d,[(200,shoulder[1]),(195,190),(195,225)],FAR)
            limb(d,[(328,hip[1]),(328,knee[1]),(383,225)],FAR)
            if name=='cat_cow':
                curve=[]
                for j in range(21):
                    u=j/20;x=190+128*u;y=(1-u)*130+u*132+math.sin(math.pi*u)*18*math.sin(t)
                    curve.append((x,y))
                limb(d,curve,INK,17)
                head(d,(154,117-12*math.sin(t)))
                limb(d,[(190,130),(173,125-9*math.sin(t))],INK,10)
                limb(d,[shoulder,(190,180),(185,225)])
                limb(d,[hip,knee,(378,225)])
            else:
                limb(d,[shoulder,hip],INK,17);limb(d,[shoulder,(170,shoulder[1]-9)],INK,10)
                head(d,(155,shoulder[1]-17))
                if name=='bird_dog':
                    reach=(1-math.cos(t))/2
                    elbow=blend((186,179),(132,127),reach);hand=blend((182,225),(74,126),reach)
                    moving_knee=blend((318,220),(379,131),reach);foot=blend((378,225),(446,134),reach)
                    limb(d,[shoulder,elbow,hand]);limb(d,[hip,moving_knee,foot])
                else:
                    limb(d,[shoulder,(188,191),(186,225)]);limb(d,[hip,knee,(376,225)])
                    breathe(d,(254,157),t)
        elif name in ['crab_hold','crab_walk']:
            travel=math.sin(t)*12 if name=='crab_walk' else 0
            bounce=math.cos(t*2)*2 if name=='crab_walk' else 0
            sh=(210+travel,141+bounce);hip=(311+travel,164+bounce)
            for far,phase in [(True,t+math.pi),(False,t)]:
                offset=8 if far else 0;color=FAR if far else GREEN
                step=math.sin(phase)*16 if name=='crab_walk' else 0
                lift=max(0,math.cos(phase))*5 if name=='crab_walk' else 0
                hand=(157+travel+step+offset,225-lift)
                foot=(398+travel-step+offset,225-lift)
                limb(d,[(sh[0]+offset,sh[1]),(183+travel+step/2+offset,182),hand],color)
                limb(d,[(hip[0]+offset,hip[1]),(363+travel-step/2+offset,174),foot],color)
            limb(d,[sh,hip],INK,17);limb(d,[sh,(209+travel,124)],INK,10);head(d,(209+travel,107))
            if name=='crab_hold':breathe(d,(263,154),t)
        elif name=='ape_hold':
            limb(d,[(238,161),(178,184),(214,225)],FAR,12)
            limb(d,[(274,161),(334,184),(298,225)],GREEN,12)
            limb(d,[(256,105),(256,166)],INK,24);head(d,(256,77))
            limb(d,[(239,109),(198,157),(195,224)],FAR)
            limb(d,[(273,109),(314,157),(317,224)],GREEN)
            breathe(d,(256,137),t)
        elif name=='side_plank':
            limb(d,[(173,137),(281,177),(399,224)],FAR,12)
            limb(d,[(167,134),(275,175)],INK,19)
            limb(d,[(275,175),(390,224)],GREEN,12)
            limb(d,[(167,134),(167,219),(115,225)],GREEN,10)
            limb(d,[(174,138),(208,95),(212,56)],FAR,8)
            limb(d,[(167,134),(148,121)],INK,10);head(d,(136,112))
            breathe(d,(238,160),t)
        elif name=='lateral_lunge':
            shift=math.sin(t);amount=abs(shift);cx=256+shift*52;hip=(cx,137+27*amount);sh=(cx,88+22*amount)
            left_knee=(191-27*max(0,-shift),177+9*amount);right_knee=(321+27*max(0,shift),177+9*amount)
            limb(d,[(hip[0]-10,hip[1]),left_knee,(150,225)],FAR,12)
            limb(d,[(hip[0]+10,hip[1]),right_knee,(362,225)],GREEN,12)
            limb(d,[sh,hip],INK,22);head(d,(cx,sh[1]-25))
            limb(d,[(cx-13,sh[1]),(cx-32,sh[1]+25),(cx,sh[1]+19)],FAR)
            limb(d,[(cx+13,sh[1]),(cx+32,sh[1]+25),(cx,sh[1]+19)],GREEN)
        d.text((20,252),caption,fill='#61725e',font=FONT)
        frames.append(image)
    frames[0].save(ROOT/(name+'.gif'),save_all=True,append_images=frames[1:],duration=90,loop=0,optimize=True)
    return frames[0],frames[10],frames[20]

DEMOS=[
 ('jumping_jack','开合跳 · 原创简图','双脚开合与双臂举落 / 轻落地'),
 ('beast_hold','兽式支撑 · 原创简图','静态保持 / 双膝微离地 / 自然呼吸'),
 ('crab_hold','蟹式支撑 · 原创简图','静态保持 / 胸口舒展 / 自然呼吸'),
 ('ape_hold','猿式深蹲 · 原创简图','静态保持 / 舒适下蹲 / 不强求深度'),
 ('crab_walk','蟹行 · 原创简图','手脚交替小步移动 / 先低速练习'),
 ('bird_dog','鸟狗式 · 原创简图','伸展对侧手脚 / 保持稳定 / 换边练习'),
 ('cat_cow','猫牛式 · 原创简图','缓慢配合呼吸 / 舒适范围内活动'),
 ('side_plank','侧平板支撑 · 原创简图','静态保持 / 肘在肩下 / 换侧练习'),
 ('lateral_lunge','侧弓步 · 原创简图','平稳侧移 / 脚掌踩稳 / 每侧记录'),
]
ROOT.mkdir(parents=True,exist_ok=True)
sheet=Image.new('RGB',(768,len(DEMOS)*160),'white')
for row,(name,title,caption) in enumerate(DEMOS):
 for col,frame in enumerate(render(name,title,caption)):
  sheet.paste(frame.resize((256,144)),(col*256,row*160))
sheet.save('/tmp/lianji-110-original-demos.png')
print('Created',len(DEMOS),'original movement diagrams')
