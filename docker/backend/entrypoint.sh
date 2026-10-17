#!/bin/sh
# Démarrage du backend : migrations, fichiers statiques de l'administration (volume partagé avec nginx), puis gunicorn.
set -e
cd /app/backend
# Les volumes nommés sont créés avec le propriétaire du premier conteneur qui les monte (nginx, en root) : on les rend
# à l'utilisateur sans privilèges, sous lequel tourne ensuite tout le reste.
if [ "$(id -u)" = 0 ]; then
    chown pyquest:pyquest /var/www/pyquest/static /var/lib/pyquest
    exec setpriv --reuid=10001 --regid=10001 --clear-groups "$0" "$@"
fi
python manage.py migrate --noinput
python manage.py collectstatic --noinput --verbosity 0
exec gunicorn pyquest_api.wsgi --bind 0.0.0.0:8000 --workers "${PYQUEST_WORKERS:-3}" --access-logfile - --error-logfile -
