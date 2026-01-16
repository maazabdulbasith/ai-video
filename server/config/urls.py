from django.contrib import admin
from django.urls import path
from behavior_analysis import views

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/data', views.receive_data),
    path('api/end_session', views.end_session),
]
