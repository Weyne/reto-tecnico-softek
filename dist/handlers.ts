//src/handlers.ts
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import axios from 'axios';
import { DynamoDB } from 'aws-sdk';

const dynamoDB = new DynamoDB.DocumentClient();
const CACHE_TABLE = process.env.CACHE_TABLE!;
const HISTORIAL_TABLE = process.env.HISTORIAL_TABLE!;
const CUSTOM_TABLE = process.env.CUSTOM_TABLE!;
const WEATHER_API_KEY = process.env.WEATHER_API_KEY;

//Función para obtener datos de la caché en DynamoDB
export const getCache = async (key: string): Promise<any> => {
  const params = {
    TableName: CACHE_TABLE,
    Key: {
      cacheKey: key,
    },
  };
  const result = await dynamoDB.get(params).promise();
  return result.Item;
};

//Función para guardar datos en caché con TTL de 30 minutos
export const setCache = async (key: string, data: any): Promise<void> => {
  const params = {
    TableName: CACHE_TABLE,
    Item: {
      cacheKey: key, //Aquí también se debe usar "cacheKey"
      data,
      ttl: Math.floor(Date.now() / 1000) + 1800, //TTL de 30 minutos
    },
  };
  await dynamoDB.put(params).promise();
};

//Función para guardar en el historial
const saveHistory = async (data: any): Promise<void> => {
  const params = {
    TableName: HISTORIAL_TABLE,
    Item: {
      id: Date.now().toString(), //O bien usar UUID para mayor robustez
      data,
      createdAt: new Date().toISOString(),
    },
  };
  await dynamoDB.put(params).promise();
};

//Handler para GET /fusionados
export const fusionadosHandler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  console.log('=== Inicio de fusionadosHandler ===');
  console.log('Evento recibido:', JSON.stringify(event, null, 2));
  
  const id = event.queryStringParameters?.id;
  if (!id) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'El query parameter \"id\" es requerido.' }),
    };
  }
  
  try {
    const cacheKey = id;
    //Verificamos si existe una respuesta en caché
	console.log('punto 0');
    const cachedData = await getCache(cacheKey);
    if (cachedData) {
	  console.log('punto 1');
      return {
        statusCode: 200,
        body: JSON.stringify(cachedData.data),
      };
    }
	console.log('punto A');

    //Solicitud a SWAPI (ejemplo: obtener datos de Luke Skywalker)
    const swapiResponse = await axios.get(`https://swapi.dev/api/planets/${id}/`);
    console.log('punto B');
    console.log('WEATHER_API_KEY: ', WEATHER_API_KEY);
    //Solicitud a la API meteorológica (ejemplo con OpenWeatherMap para una ubicación predefinida)
    const weatherResponse = await axios.get('https://api.openweathermap.org/data/2.5/forecast', {
      params: {
        //q: 'London',
        appid: WEATHER_API_KEY,
        //units: 'metric',
		id: 524901
      },
    });
	console.log('punto C');
    const forecastData = weatherResponse.data;
    const processedWeather = {
      city: {
        id: forecastData.city.id,
        name: forecastData.city.name,
        country: forecastData.city.country,
        coord: forecastData.city.coord,
        timezone: forecastData.city.timezone,
        sunrise: forecastData.city.sunrise,
        sunset: forecastData.city.sunset,
      },
      forecast: forecastData.list.map((item: any) => ({
        dt: item.dt,
        date: item.dt_txt,
        temperature: item.main.temp,
        feels_like: item.main.feels_like,
        humidity: item.main.humidity,
        description: item.weather[0].description,
        windSpeed: item.wind.speed,
      })),
    };
    //Fusión de datos: se combinan los datos de SWAPI y la API meteorológica
    const fusionadosData = {
      planet: swapiResponse.data,
      weather: processedWeather,
    };
	console.log('punto D');
    //Guardamos la respuesta en el historial para futuras consultas
    await saveHistory(fusionadosData);
	console.log('punto E');
    //Guardamos la respuesta en la caché
    await setCache(cacheKey, fusionadosData);
	console.log('punto F');
    return {
      statusCode: 200,
      body: JSON.stringify(fusionadosData),
    };

  } catch (error) {
    console.error('Error en /fusionados:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Error al obtener los datos fusionados' }),
    };
  }
};

//Handler para POST /almacenar
export const almacenarHandler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    if (!event.body) {
      return { statusCode: 400, body: JSON.stringify({ error: 'No se envió información' }) };
    }
    const body = JSON.parse(event.body);
    const params = {
      TableName: CUSTOM_TABLE,
      Item: {
        id: Date.now().toString(),
        ...body,
        createdAt: new Date().toISOString(),
      },
    };
    await dynamoDB.put(params).promise();
    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Información almacenada correctamente' }),
    };
  } catch (error) {
    console.error('Error en /almacenar:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Error al almacenar la información' }),
    };
  }
};

//Handler para GET /historial
export const historialHandler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    //Obtenemos los parámetros de paginación: limit y offset. 
    //Si no se proporcionan, se usan valores por defecto: limit=10, offset=0.
    const limit = event.queryStringParameters?.limit ? parseInt(event.queryStringParameters.limit, 10) : 10;
    const offset = event.queryStringParameters?.offset ? parseInt(event.queryStringParameters.offset, 10) : 0;

    //Escaneamos la tabla completa. (En producción se recomienda usar un diseño con índices para paginación)
    const params = {
      TableName: HISTORIAL_TABLE,
    };
    const result = await dynamoDB.scan(params).promise();
    let items = result.Items || [];

    //Ordenamos cronológicamente por fecha de creación (suponiendo que "createdAt" es una propiedad de cada registro)
    items.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

    //Total de registros encontrados
    const totalRecords = items.length;

    //Aplicamos la paginación: obtenemos los elementos desde 'offset' hasta 'offset + limit'
    const paginatedItems = items.slice(offset, offset + limit);

    //Calculamos la página actual (asumiendo que offset = (currentPage - 1) * limit)
    const currentPage = Math.floor(offset / limit) + 1;

    return {
      statusCode: 200,
      body: JSON.stringify({
		pagination: {
		limit: limit,
        totalRecords: totalRecords,
        currentPage: currentPage
		},
        items: paginatedItems
      }),
    };
  } catch (error) {
    console.error('Error en /historial:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Error al obtener el historial' }),
    };
  }
};