set -e
HERE="$(cd "$(dirname "$0")" && pwd)"
SRC="${SRC:?set SRC to the extracted ffmpeg-9.0.2 source directory}"
BUILD="${BUILD:-$PWD/build-ffmpeg}"
OUT="${OUT:-$HERE/../bin}"
DEMUXERS="wav,w64,mp3,aac,loas,ac3,eac3,dts,truehd,mlp,mov,matroska,ogg,flac,amr,amrnb,amrwb,asf,xwma,flv,live_flv,avi,caf,aiff,au,voc,mpegts,mpegps,wv,ape,tta"
DECODERS="pcm_s8,pcm_u8,pcm_s16le,pcm_s16be,pcm_s24le,pcm_s24be,pcm_s32le,pcm_s32be,pcm_f32le,pcm_f32be,pcm_f64le,pcm_alaw,pcm_mulaw,adpcm_ms,adpcm_ima_wav,adpcm_ima_qt,gsm,gsm_ms,mp1,mp1float,mp2,mp2float,mp3,mp3float,aac,aac_fixed,aac_latm,ac3,ac3_fixed,eac3,dca,truehd,mlp,opus,vorbis,flac,alac,amrnb,amrwb,wmav1,wmav2,wmapro,wmalossless,ape,tta,wavpack"
PARSERS="aac,aac_latm,ac3,mpegaudio,opus,vorbis,flac,dca,mlp,amr,gsm"
rm -rf "$BUILD"
mkdir -p "$BUILD" "$OUT"
cp -r "$SRC" "$BUILD/src"
cd "$BUILD"
./src/configure \
  --prefix=/opt/dsh-rvc \
  --arch=x86_64 \
  --disable-everything \
  --disable-autodetect \
  --disable-doc \
  --disable-debug \
  --disable-network \
  --disable-programs \
  --enable-ffmpeg \
  --disable-avdevice \
  --disable-swscale \
  --disable-x86asm \
  --enable-small \
  --enable-static \
  --disable-shared \
  --enable-protocol=file,pipe \
  --enable-demuxer="$DEMUXERS" \
  --enable-decoder="$DECODERS" \
  --enable-parser="$PARSERS" \
  --enable-encoder=pcm_s16le \
  --enable-muxer=wav,null \
  --enable-filter=abuffer,abuffersink,aresample,aformat,anull,atrim \
  --extra-ldflags=-static
make -j"$(nproc)"
strip -o "$OUT/ffmpeg.exe" ffmpeg.exe
cp src/COPYING.LGPLv2.1 "$OUT/ffmpeg-LICENSE.txt"
"$OUT/ffmpeg.exe" -hide_banner -version > "$OUT/ffmpeg-BUILD.txt"
echo "source: https://ffmpeg.org/releases/ffmpeg-9.0.2.tar.xz" >> "$OUT/ffmpeg-BUILD.txt"
echo "built with MSYS2 UCRT64 gcc using scripts/build-ffmpeg.sh from this package" >> "$OUT/ffmpeg-BUILD.txt"
ls -la "$OUT"
echo FFMPEG_BUILD_OK
