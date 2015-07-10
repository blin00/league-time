'use strict';

module.exports = function(grunt) {
    grunt.initConfig({
        copy: {
            all: {
                files: [
                    {
                        expand: true,
                        cwd: 'node_modules',
                        flatten: true,
                        src: ['bootstrap/dist/css/bootstrap.min.css'],
                        dest: 'public/css',
                    },
                ],
            },
        },
        cssmin: {
            all: {
                files: [
                    {
                        expand: true,
                        cwd: 'src',
                        src: '**/*.css',
                        dest: 'public/css',
                    }
                ],
            },
        },
        browserify: {
            all: {
                options: {
                    browserifyOptions: {
                        fullPaths: false,
                        noParse: ['d3'],
                    },
                    configure: function(b) {
                        b.plugin('minifyify', {
                            map: false,
                        });
                    },
                },
                files: [
                    {
                        expand: true,
                        cwd: 'src',
                        src: ['index.js'],
                        dest: 'public/js',
                    },
                ],
            },
        },
        shell: {
            nodemon: {
                command: 'nodemon --ignore src/ --ignore public/',
                options: {
                    async: true,
                },
            },
        },
        watch: {
            css: {
                files: ['src/**/*.css'],
                tasks: ['cssmin'],
            },
        },
    });
    require('load-grunt-tasks')(grunt);
    grunt.registerTask('default', ['copy', 'cssmin', 'browserify']);
    grunt.registerTask('live', function() {
        grunt.config('browserify.all.options.browserifyOptions.debug', true);
        grunt.config('browserify.all.options.configure', null);
        grunt.config('browserify.all.options.watch', true);
        grunt.task.run(['shell:nodemon', 'default', 'watch']);
    });
};
