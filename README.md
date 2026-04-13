# Russian Metal Industry Map

Актуальная версия интерактивной карты металлургии России на `Next.js + React + TypeScript`.

Репозиторий содержит **полное приложение**, а не старую статическую HTML-версию.

## Что реализовано

- Интерактивная карта регионов РФ с переключением показателей.
- Клик по региону открывает подробную статистику по всем индикаторам.
- Градация показателей через заливку оттенками синего.
- Легенда для каждого показателя с целыми интервалами.
- Экспорт карты в PNG вместе с названием и легендой.
- Полный список всех 89 регионов внизу экрана (алфавитный порядок).
- Поддержка городов федерального значения маркерами: Москва, Санкт-Петербург, Севастополь.

## Данные и карта

- Данные: [`public/data/map-data.json`](public/data/map-data.json)
- SVG-карта: [`public/data/russia-map-clean.svg`](public/data/russia-map-clean.svg)
- Подписи (референс): [`public/data/russia-map-labeled.svg`](public/data/russia-map-labeled.svg)

## Локальный запуск

```bash
npm install
npm run dev
```

Откройте: `http://localhost:3000`

## Сборка

```bash
npm run build
npm run start
```

## Основной код интерфейса

- Страница карты: [`src/app/page.tsx`](src/app/page.tsx)
- Метаданные приложения: [`src/app/layout.tsx`](src/app/layout.tsx)
- API данных карты: [`src/app/api/map-data/route.ts`](src/app/api/map-data/route.ts)
