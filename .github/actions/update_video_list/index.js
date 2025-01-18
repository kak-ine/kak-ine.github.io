console.log("Hello world");

import fetch from 'node-fetch';
import { JSDOM } from 'jsdom';
import puppeteer from 'puppeteer';
import path from 'path';
import fs from 'fs';

const galleryBaseUrl = 'https://gall.dcinside.com/mini/board/lists?id=ineviolet';
const maxRetries = 5;
const keyword = "아이네";
let currentVideoIndex = -1;
let currentIndex = -1;
let isPlaying = false;
let isFirstPlayTriggered = false;  // 🔥 첫 재생 여부
let isHidden = false;  // 🔥 숨김 상태 여부 저장
let shuffledItems = []

const headers = {
	'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
}

// 🔥 새로 추가: { title: ..., videoUrl: ... } 형태의 배열
const videoItems = [];

// 📌 랜덤 딜레이 (2~5초)
const delay = (min = 2000, max = 5000) => new Promise(resolve => setTimeout(resolve, Math.floor(Math.random() * (max - min + 1)) + min));

// 📌 도메인 변경 함수 (dcm6 → dcm1)
function replaceDomain(videoUrl) {
	return videoUrl.replace('dcm6', 'dcm1');
}

async function extractVideoSrcFromIframe(postUrl, iframeSelector, videoSelector) {
	const browser = await puppeteer.launch({
		headless: true,  // headless 모드로 실행
		args: ['--no-sandbox', '--disable-setuid-sandbox']
	});

	const page = await browser.newPage();

	try {
		// ✅ User-Agent 설정 (봇 차단 우회)
		await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');

		// // ✅ navigator 객체 우회
		// await page.evaluateOnNewDocument(() => {
		// 	Object.defineProperty(navigator, 'webdriver', {
		// 		get: () => false,
		// 	});
		// 	window.navigator = {
		// 		userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
		// 		platform: 'Win32',
		// 		language: 'ko-KR',
		// 		languages: ['ko-KR', 'ko'],
		// 	};
		// });

		// 1️⃣ 페이지 열기
		await page.goto(postUrl, { waitUntil: 'networkidle2' });

		// 2️⃣ iframe 요소 로딩 대기
		await page.waitForSelector(iframeSelector, { timeout: 30000 });

		// 3️⃣ iframe 접근
		const iframeHandle = await page.$(iframeSelector);
		const frame = await iframeHandle.contentFrame();

		if (!frame) {
			throw new Error('❌ iframe을 찾을 수 없습니다.');
		}

		// 4️⃣ iframe 내부의 video 요소 대기
		await frame.waitForSelector(videoSelector, { timeout: 30000 });

		// 5️⃣ video > source의 src 추출
		const videoSrc = await frame.$eval(`${videoSelector} > source`, source => source.src);

		// Return real video url
		if (videoSrc) {
			// console.log('🎥 Video src:', videoSrc);
			return replaceDomain(videoSrc)
		}
		return null

	} catch (error) {
		console.error('❌ 오류 발생:', error.message);
	} finally {
		await browser.close();
	}

	return null
}


// 📌 동영상 링크 추출
const fetchVideoUrl = async (postUrl, retryCount = 0) => {
	const iframeSelector = 'iframe[id^="movieIcon"]';  // iframe의 CSS 셀렉터
	const videoSelector = 'video#dc_mv';              // iframe 내부 video 셀렉터
	const videoUrl = await extractVideoSrcFromIframe(postUrl, iframeSelector, videoSelector);
	return videoUrl;
};


// 📌 최대 페이지 수 자동 추출
const fetchMaxPageNumber = async (retryCount = 0) => {
	try {
		const response = await fetch(galleryBaseUrl);
		const text = await response.text();
		const dom = new JSDOM(text);
		const doc = dom.window.document;
		const totalPageElement = doc.querySelector('span.num.total_page');
		return parseInt(totalPageElement.textContent.trim());
	} catch (error) {
		if (retryCount < maxRetries) {
			await delay();
			return fetchMaxPageNumber(retryCount + 1);
		} else {
			return 1;
		}
	}
};

// 📌 게시글 링크 수집 (순차적 페이지 + 재시도 기능)
const fetchPostLinksSeq = async (maxPageNumber, retryCount = 0) => {

	let i = 0;
	let retry = 0
	for (i = 0; i < maxPageNumber; i++) {
		const PageUrl = `${galleryBaseUrl}&page=${i + 1}`;

		try {
			const response = await fetch(PageUrl, {
				headers: headers
			});

			if (!response.ok) throw new Error(`응답 실패 (상태 코드: ${response.status})`);

			const text = await response.text();
			const dom = new JSDOM(text);
			const doc = dom.window.document;

			const links = doc.querySelectorAll('a[href*="/mini/board/view"]');
			const postLinks = [];

			links.forEach(link => {
				const href = link.getAttribute('href');
				const title = link.textContent.trim() || "";
				// 🔥 "아이네" 포함 제목만 수집
				if (href && title.includes(keyword)) {
					// 갤러리 글 주소
					const postUrl = `https://gall.dcinside.com${href}`;
					postLinks.push({ postUrl, title });
				}
			});

			if (postLinks.length === 0) throw new Error('게시글 링크를 찾을 수 없음');
			console.log(`📄 ${PageUrl} 페이지에서 ${postLinks.length}개의 게시글 링크 수집 완료`);

			// 🔥 각 postUrl에서 videoUrl 추출, videoItems에 저장
			for (const item of postLinks) {
				const videoUrl = await fetchVideoUrl(item.postUrl, retryCount);
				await delay();
				if (videoUrl) {
					videoItems.push({
						title: item.title,
						videoUrl: videoUrl
					});
					console.log(item.title, videoUrl);
				} 
				break;
			}
			console.log(`📄 ${PageUrl} 페이지에서 ${videoItems.length}개의 동영상 링크 수집 완료`);


		} catch (error) {
			console.warn(`❌ 게시글 링크 수집 실패: ${error.message}, retryCount: ${retry}`);
			if (retry >= retryCount) {
				retry = 0
				continue
			}
			i--;
			retry++;
		}
	}

};


// INE 갤러리 크롤링하여 비디오 링크 수집
// const maxPageNumber = await fetchMaxPageNumber();
// await fetchPostLinksSeq(maxPageNumber, 5);
await fetchPostLinksSeq(1, 5);
console.log('수집된 videoItems:', videoItems);



// ../../../data/videos.json
const videoJsonPath = path.join(__dirname, '..', '..', '..', 'data', 'videos.json')
fs.writeFileSync(videoJsonPath, JSON.stringify(videoItems, null, 2), 'utf-8');
