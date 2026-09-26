package com.bawibase.chorong.config

import io.swagger.v3.oas.annotations.Hidden
import org.springframework.http.MediaType
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RestController

@RestController
@Hidden
class ApiDocsController {
    @GetMapping("/docs", produces = [MediaType.TEXT_HTML_VALUE])
    fun docs(): String =
        """
        <!doctype html>
        <html lang="ko">
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <title>chorong API</title>
        </head>
        <body>
          <div id="app"></div>
          <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script>
          <script>
            Scalar.createApiReference('#app', { url: '/api-docs', theme: 'kepler' })
          </script>
        </body>
        </html>
        """.trimIndent()
}
