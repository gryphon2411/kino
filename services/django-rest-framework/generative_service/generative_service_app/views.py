from django.apps import apps
from rest_framework.response import Response
from rest_framework.views import APIView

from generative_service_app.rpc.rpc_client import RpcClient


class TitleFacts(APIView):
    def __init__(self):
        super().__init__()

        app_config = apps.get_app_config("generative_service_app")
        self._generative_model = app_config.active_generative_model
        self._rpc_client = RpcClient("kino.data_service.title.rpc", "rpc")

    def post(self, request, title_id, format=None):
        response = self._rpc_client.request({"title_id": title_id})
        if "error-code" in response.properties.headers:
            return Response(status=response.properties.headers["error-code"])

        title_name, title_year, title_type = self._get_title_name_and_year(response)

        facts = self._generative_model.prompt_title_facts(title_name, title_year, title_type)

        return Response({"facts": facts})

    def _get_title_name_and_year(self, response):
        data = response.json()
        title_name = data.get('originalTitle')

        start_year = data.get('startYear')
        end_year = data.get('endYear')

        title_year = end_year if end_year else start_year

        title_type = data.get('titleType')

        return title_name, title_year, title_type
