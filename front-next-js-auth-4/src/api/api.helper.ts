export const getContentType = () => ({
	'Content-Type': 'application/json'
})

export const errorCatch = (error: any): string => {
	// Запрос ушёл, но ответа нет: бэкенд выключен или недоступен
	if (error?.isAxiosError && !error.response) {
		return 'Нет связи с сервером. Проверьте подключение и повторите'
	}

	const message = error?.response?.data?.message

	return message
		? typeof error.response.data.message === 'object'
			? message[0]
			: message
		: error.message
}
