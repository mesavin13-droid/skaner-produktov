# Публикация на Vercel

1. Откройте https://vercel.com/new и выберите репозиторий `mesavin13-droid/skaner-produktov`.
2. Root Directory: `./`, Framework Preset: `Vite`, Build Command: `npm run build`, Output Directory: `dist`.
3. Нажмите **Deploy** и дождитесь статуса **Ready**.
4. В Project → Settings → Environment Variables укажите `APP_CONTACT_URL` (действительный адрес сайта или разработчика). Для фотоанализа добавьте секрет `OPENAI_API_KEY` и, по желанию, `OPENAI_VISION_MODEL=gpt-4.1-mini`.
5. После изменения переменных сделайте Redeploy. Ключи не кладите в GitHub и не добавляйте префикс `VITE_`.
6. Откройте ссылку в HTTPS и проверьте камеру, EAN-13, ручной ввод и работу `/api/product`.

**Важно:** перед публичным включением платных ИИ-запросов необходимо добавить авторизацию / rate limit, чтобы ограничить расход бюджета.
