"""Готує звуки гри з CC0-джерел (OpenGameArt) у src/assets/sfx/*.ogg (моно, 22 кГц, Vorbis).
Використання: python3 tools/sounds.py <тека з сирими файлами>. Джерела й ліцензії — src/assets/sfx/CREDITS.md."""
import subprocess, sys, os, wave
import numpy as np

SRC = sys.argv[1]
OUT = 'src/assets/sfx'
os.makedirs(OUT, exist_ok=True)

def ff(args, out):
    cmd = ['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y'] + args + ['-ac', '1', '-ar', '22050', '-c:a', 'libvorbis', '-q:a', '1', f'{OUT}/{out}.ogg']
    subprocess.run(cmd, check=True)

def p(rel):
    return os.path.join(SRC, rel)

# найгучніше 11-секундне вікно сирени
tmp = '/tmp/_siren.wav'
subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-i', p('storm_3_siren.ogg'), '-ac', '1', '-ar', '8000', tmp], check=True)
with wave.open(tmp) as w:
    a = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float32)
sr = 8000
rms = np.sqrt(np.convolve(a * a, np.ones(sr * 11) / (sr * 11), mode='valid'))
# найчистіший тон сирени (виміряно спектром): 38–49 с запису; гучний кінець — вітер і грім
start = 38
print('siren window start', start, 's')
NORM = 'dynaudnorm=f=150:g=15,alimiter=limit=0.9'
ff(['-ss', str(start), '-t', '11', '-i', p('storm_3_siren.ogg'), '-af', f'highpass=f=120,{NORM},afade=t=in:d=1.2,afade=t=out:st=8.5:d=2.5'], 'siren')
ff(['-i', p('100-CC0-SFX_0/bell_01.ogg'), '-af', 'loudnorm=I=-18'], 'allclear')
ff(['-i', p('synthetic_explosion_1.flac'), '-af', 'loudnorm=I=-14,afade=t=out:st=0.9:d=0.28'], 'boom')
ff(['-i', p('sci-fi-sfx/explosion_01.ogg'), '-af', 'bass=g=6,loudnorm=I=-13,afade=t=out:st=1.4:d=0.44'], 'bigboom')
ff(['-i', p('25-CC0-bang-sfx/fw_02.ogg'), '-t', '0.9', '-af', 'loudnorm=I=-17,afade=t=out:st=0.6:d=0.3'], 'kill')
ff(['-i', p('25-CC0-bang-sfx/bang_03.ogg'), '-t', '0.45', '-af', 'lowpass=f=2500,loudnorm=I=-20,afade=t=out:st=0.25:d=0.2'], 'pop')
# черга кулемета: 4 постріли через 70 мс
shot = p('25-CC0-bang-sfx/shot_02.ogg')
ff(['-i', shot, '-i', shot, '-i', shot, '-i', shot, '-filter_complex',
    '[0]atrim=0:0.2[a0];[1]atrim=0:0.2,adelay=70[a1];[2]atrim=0:0.2,adelay=140[a2];[3]atrim=0:0.25,adelay=210[a3];[a0][a1][a2][a3]amix=inputs=4:normalize=0,highpass=f=300,loudnorm=I=-16'], 'mg')
can = p('25-CC0-bang-sfx/cannon_01.ogg')
ff(['-i', can, '-i', can, '-i', can, '-filter_complex',
    '[0]atrim=0:0.3[a0];[1]atrim=0:0.3,adelay=110[a1];[2]atrim=0:0.45,adelay=220[a2];[a0][a1][a2]amix=inputs=3:normalize=0,loudnorm=I=-15,afade=t=out:st=0.5:d=0.17'], 'gepard')
ff(['-i', p('sci-fi-sfx/rocket_01.ogg'), '-af', 'loudnorm=I=-16,afade=t=out:st=1.5:d=0.55'], 'launch')
ff(['-i', p('motor_looping_0.mp3'), '-af', 'asetrate=44100*1.9,aresample=22050,loudnorm=I=-20,afade=t=in:d=0.05,afade=t=out:st=0.35:d=0.2', '-t', '0.55'], 'interceptor')
ff(['-i', p('motor_looping_0.mp3'), '-af', 'loudnorm=I=-18'], 'drone_loop')
ff(['-i', p('sci-fi-sfx/loop_machine_01.ogg'), '-af', 'lowpass=f=500,loudnorm=I=-20'], 'generator_loop')
ff(['-i', p('100-CC0-SFX_0/switch_01.ogg'), '-af', 'loudnorm=I=-20'], 'click')
ff(['-i', p('sci-fi-sfx/beep_02.ogg'), '-af', 'loudnorm=I=-20'], 'ok')
ff(['-i', p('sci-fi-sfx/retro_beep_06.ogg'), '-af', 'loudnorm=I=-21'], 'error')
ff(['-i', p('100-CC0-SFX_0/tools_02.ogg'), '-af', 'loudnorm=I=-18'], 'build')
b = p('sci-fi-sfx/beep_01.ogg')
ff(['-i', b, '-i', b, '-i', b, '-filter_complex', '[0]atrim=0:0.2[a0];[1]atrim=0:0.2,adelay=250[a1];[2]atrim=0:0.2,adelay=500[a2];[a0][a1][a2]amix=inputs=3:normalize=0,loudnorm=I=-18'], 'alarm')
# додаткові варіанти, щоб вибухи не звучали однаково
ff(['-i', p('sci-fi-sfx/explosion_02.ogg'), '-af', 'bass=g=4,loudnorm=I=-15,afade=t=out:st=0.9:d=0.3'], 'boom2')
ff(['-i', p('25-CC0-bang-sfx/cannon_03.ogg'), '-af', 'lowpass=f=1800,loudnorm=I=-17,afade=t=out:st=0.8:d=0.4'], 'boom_far')
ff(['-i', p('25-CC0-bang-sfx/fw_04.ogg'), '-t', '0.9', '-af', 'loudnorm=I=-18,afade=t=out:st=0.6:d=0.3'], 'kill2')
ff(['-i', p('100-CC0-SFX_0/metal_03.ogg'), '-af', 'loudnorm=I=-20'], 'repair')
# ---- фонова музика (CC0, OpenGameArt): день — «sector» (Dark Sci-Fi Audio Pack), тривога — «War Theme»
MUS = os.path.join(os.path.dirname(SRC.rstrip('/')), 'music')
if os.path.isdir(MUS):
    os.makedirs('src/assets/music', exist_ok=True)
    def mus(args, out):
        subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y'] + args + ['-ac', '1', '-ar', '22050', '-c:a', 'libvorbis', '-q:a', '0', f'src/assets/music/{out}.ogg'], check=True)
    mus(['-i', os.path.join(MUS, 'sector_0.mp3'), '-af', 'loudnorm=I=-22,afade=t=in:d=1.5,afade=t=out:st=54:d=2.8'], 'day')
    mus(['-t', '125', '-i', os.path.join(MUS, 'war%20theme_0.ogg'), '-af', 'loudnorm=I=-21,afade=t=in:d=2,afade=t=out:st=121:d=4'], 'alert')
    for f in sorted(os.listdir('src/assets/music')):
        print(f'music {f:14s} {os.path.getsize("src/assets/music/" + f)/1024:7.1f} KB')

tot = 0
for f in sorted(os.listdir(OUT)):
    if f.endswith('.ogg'):
        sz = os.path.getsize(f'{OUT}/{f}')
        tot += sz
        print(f'{f:22s} {sz/1024:6.1f} KB')
print('total', round(tot / 1024), 'KB')
