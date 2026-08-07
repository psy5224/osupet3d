# 몽글이 작업실

여러 장의 강아지 또는 고양이 사진에서 고유한 특징을 참고해 동화풍 일러스트를 만들고, 완성된 이미지를 Meshy Image to 3D API로 변환하는 웹앱입니다.

## 로컬 실행

1. Node.js 20 이상을 설치합니다.
2. `.env.example`을 `.env`로 복사합니다.
3. `.env`에 두 API 키를 입력합니다.

```env
OPENAI_API_KEY=sk-...
MESHY_API_KEY=...
PORT=3000
```

4. 아래 명령을 실행합니다.

```powershell
npm start
```

5. 브라우저에서 `http://localhost:3000`을 엽니다.

## 사용 흐름

1. 같은 강아지 또는 고양이 사진을 1~6장 올립니다.
2. `동화 속 모습 만나기`를 눌러 옷과 착용물이 없는 정사각형 동화풍 이미지를 만듭니다.
3. 완성 이미지 아래의 `3D 모델 만들기`를 누릅니다.
4. Meshy 작업이 끝나면 화면에서 GLB 모델을 회전해 보고 GLB, FBX, OBJ, USDZ 파일을 저장할 수 있습니다.
5. `리토폴로지로 8K~9K 버텍스 목표`를 누르면 쿼드 8,500 폴리곤 목표의 별도 경량화 모델을 만들 수 있습니다.

3D 변환과 리토폴로지는 각각 Meshy 크레딧을 사용합니다. Meshy Remesh API는 버텍스가 아니라 목표 폴리곤 수를 받으므로 실제 버텍스 수는 모델 형상에 따라 8천~9천 범위에서 벗어날 수 있습니다. 생성된 모델의 다운로드 주소에는 유효기간이 있으므로 필요한 파일은 바로 저장하는 편이 좋습니다.

## Render 배포

- Build Command: 비워두거나 `npm install`
- Start Command: `npm start`
- Environment Variables:
  - `OPENAI_API_KEY`
  - `MESHY_API_KEY`

API 키는 프런트엔드 코드에 넣지 말고 Render의 환경 변수에만 저장하세요.

## 구현 메모

- 사진과 생성 이미지는 로컬 파일로 저장하지 않고 메모리에서 각 API로 전달됩니다.
- Meshy에는 OpenAI가 반환한 PNG 데이터 URI를 바로 전달하므로 별도 이미지 업로드 서버가 필요하지 않습니다.
- 실제 공개 서비스에서는 로그인, 요청 횟수 제한, 비용 한도, 파일 검증, 개인정보 처리방침을 추가하세요.

참고: [Meshy Image to 3D API](https://docs.meshy.ai/en/api/image-to-3d), [Meshy Remesh API](https://docs.meshy.ai/en/api/remesh), [`model-viewer`](https://modelviewer.dev/)
