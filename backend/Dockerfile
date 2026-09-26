FROM eclipse-temurin:21-jdk-alpine AS build

WORKDIR /app

COPY gradlew gradlew
COPY gradle gradle
RUN chmod +x gradlew

COPY settings.gradle.kts build.gradle.kts ./
COPY core/build.gradle.kts core/build.gradle.kts

RUN ./gradlew :core:dependencies --no-daemon 2>/dev/null || true

COPY core/src core/src

RUN ./gradlew :core:bootJar --no-daemon -x test

FROM eclipse-temurin:21-jre-alpine

WORKDIR /app
COPY --from=build /app/core/build/libs/*.jar app.jar

EXPOSE 8080
ENTRYPOINT ["java", "-jar", "app.jar"]
