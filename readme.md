# Backend Nodejs Challenge

## Descripción
Esta API RESTful se desarrolló para el desafío técnico de Backend Nodejs/AWS. Integra dos APIs públicas: la API de Star Wars (SWAPI) y la API meteorológica de OpenWeatherMap, fusionando sus datos en un modelo unificado.

## Endpoints
- **GET /fusionados**: Consulta ambas APIs, fusiona la información y la almacena en caché y en el historial.
- **POST /almacenar**: Almacena datos personalizados en la base de datos.
- **GET /historial**: Retorna el historial de respuestas del endpoint `/fusionados`, ordenado cronológicamente y paginado mediante offset y limit.

## Características
- **Tecnologías:** Node.js (v20), TypeScript, AWS Lambda, API Gateway y DynamoDB.
- **Despliegue:** Utiliza Serverless Framework para desplegar la solución en AWS.
- **Caché:** Implementa un sistema de caché para evitar llamadas repetitivas a las APIs externas.
- **Pruebas:** Pruebas unitarias e integración utilizando Jest.

## Instalación y Ejecución
1. Clona el repositorio:
   ```bash
   git clone <URL_del_repositorio>
   cd <nombre_del_proyecto>