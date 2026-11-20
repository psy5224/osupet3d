# 오수펫 추모공원

사용자가 올린 강아지 또는 고양이 사진 1~6장만 사용해 같은 반려동물 한 마리의 스튜디오 전신 실사 이미지를 만들고, 그 결과를 Meshy Image to 3D API로 변환하는 웹앱입니다.

이미지는 [GPT Image 2.6 Sunburst](https://developers.openai.com/api/docs/models/gpt-image-2.6-sunburst)로 생성하며, 출력은 세로 4:5 비율의 고품질 1792×2240 PNG입니다.

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
2. `스튜디오 이미지 만들기`를 눌러 흰 배경의 전신 실사 이미지를 만듭니다.
3. 이미지가 완성되면 3D 변환과 쿼드 20,000폴리곤 목표 리토폴로지가 차례로 자동 실행됩니다.
4. 최종 리토폴로지 GLB가 완성되면 `pet3D_날짜_시간.glb` 이름으로 자동 다운로드됩니다.
5. 모든 생성이 완료된 뒤에만 `Anything World에 업로드` 버튼이 나타납니다.
6. 버튼을 눌러 Anything World 페이지를 열고 다운로드된 GLB 파일을 선택합니다.

3D 변환과 리토폴로지는 각각 Meshy 크레딧을 사용합니다. 20,000은 목표 폴리곤 수이며 실제 면 수는 모델 형상에 따라 달라집니다. 생성된 모델의 다운로드 주소에는 유효기간이 있으므로 필요한 파일은 바로 저장하는 편이 좋습니다.

이미지 생성 시 카메라는 눈높이에서 정면 기준 약 20° 옆에 둡니다. 얼굴과 가슴은 화면 왼쪽 앞에, 몸통은 오른쪽 뒤로 보이는 구도입니다. 앞발은 어깨 너비, 뒷발은 골반 너비 정도로 벌리고 다리 사이에 흰 배경이 보여 네 발의 윤곽이 구분되도록 요청합니다. 사진에서 확인되는 머리와 몸통의 비율, 다리 길이, 좌우가 다른 털 무늬를 살리고 발 아래에만 옅은 접지 그림자를 둡니다. 꼬리가 확인되면 실제 길이와 끝의 곡선을 살려 오른쪽 뒤에서 위로 세우고, 가려졌거나 없는 꼬리는 보이는 모습 그대로 표현합니다.

3D 변환은 Meshy 6의 고정밀 원본 메시 설정(`should_remesh: false`)과 이미지 보정 비활성화(`image_enhancement: false`)를 사용합니다. 리토폴로지는 원본 작업 ID가 거부될 경우 Meshy의 GLB 주소로 자동 재시도합니다. 한 장의 이미지에 보이지 않는 옆면과 뒷면은 AI가 추정합니다.

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
