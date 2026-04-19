import json
import uuid
from logging import getLogger
from typing import Optional

from django.apps import apps
from pika.adapters.blocking_connection import BlockingConnection
from pika.connection import ConnectionParameters
from pika.credentials import PlainCredentials
from pika.spec import BasicProperties

from generative_service_app.rpc.rpc_json_response import RpcJsonResponse


class RpcClient:
    def __init__(self, exchange_name, routing_key):
        self._logger = getLogger(self.__class__.__name__)
        self._response = None  # type: Optional[RpcJsonResponse]
        self._correlation_id = None
        self._exchange_name = exchange_name
        self._routing_key = routing_key

        self._connection = self._get_connection()
        self._channel = self._connection.channel()
        self._callback_queue = self._get_callback_queue()

        self._setup_responses_queue()

    def _get_connection(self):
        credentials = PlainCredentials(
            apps.get_app_config("generative_service_app").rabbitmq_username,
            apps.get_app_config("generative_service_app").rabbitmq_password)

        parameters = ConnectionParameters(
            apps.get_app_config("generative_service_app").rabbitmq_host_address,
            apps.get_app_config("generative_service_app").rabbitmq_host_port,
            apps.get_app_config("generative_service_app").rabbitmq_vhost,
            credentials,
            client_properties={"connection_name": str(self.__class__)})

        connection = BlockingConnection(parameters)

        self._logger.debug("Connected to %s", connection)

        return connection

    def _get_callback_queue(self):
        result = self._channel.queue_declare(queue='', exclusive=True)

        return result.method.queue

    def _setup_responses_queue(self):
        self._channel.basic_consume(self._callback_queue, self.on_message_callback, auto_ack=True)

    def on_message_callback(self, channel, method, properties: BasicProperties, body: bytes):
        if self._correlation_id == properties.correlation_id:
            self._response = RpcJsonResponse(properties, body)

    def request(self, body) -> Optional[RpcJsonResponse]:
        self._response = None
        self._correlation_id = str(uuid.uuid4())

        properties = BasicProperties(reply_to=self._callback_queue,
                                     correlation_id=self._correlation_id)

        self._channel.basic_publish(self._exchange_name, self._routing_key, json.dumps(body), properties)

        while self._response is None:
            self._connection.process_data_events(time_limit=None)

        return self._response

# Usage:
# rpc_client = RpcClient('kino.data_service.title.rpc', 'rpc')
# print(" [x] Requesting title")
# response = rpc_client.call('title_id')
# print(f" [.] Got {response}")
