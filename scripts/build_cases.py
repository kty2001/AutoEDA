"""사례 리포트 생성 — 공개 데이터셋 → pages/case/*.html

대응 유스케이스: UC-18 (docs/use-cases.md)

이 프로젝트에서 Python 을 쓰는 유일한 자리다. 런타임(브라우저)은 JavaScript 이고
Python 은 빌드타임 전용이다. → docs/tech-stack.md §3

⚠️ 실행 전 반드시 docs/data-sources.md 의 이용 조건 판정을 완료할 것.
   광고 게재는 상업적 사용이며, 판정이 끝나지 않은 데이터셋은 사례 리포트로 만들지 않는다.
   현재 C1~C6 전부 미판정 상태다.

⚠️ 자동 생성 결과를 그대로 발행하지 않는다. 사람이 쓴 해석 원고와 병합해야 하며,
   지표만 있는 사례는 발행 대상이 아니다 — 안티패턴 #1(외부 데이터 재포장) ·
   #2(프로그램 생성 페이지 대량 발행). → docs/content-strategy.md §10

⚠️ 원본 데이터를 사이트에 올리지 않는다. 집계 통계와 해석만 게시한다.
   이것이 재배포 조항 리스크를 회피하는 근거다. → docs/data-sources.md §2

TODO
1) 데이터셋 로드 (pandas)
2) 지표 산출 — 브라우저 엔진과 같은 정의를 써야 결과가 어긋나지 않는다.
   임계값은 js/domain/thresholds.js 를 단일 원천으로 삼고 여기서 중복 정의하지 않는다
   (JSON 으로 내보내 읽거나, 값을 옮길 경우 tests 로 대조)
3) 사람이 쓴 해석 원고(data/case_source/*.md 예정)와 병합
4) 출처·라이선스·확인일 표기 삽입 (docs/data-sources.md §6 표시 요건)
5) pages/case/*.html + pages/case/index.html 출력
"""

raise NotImplementedError
